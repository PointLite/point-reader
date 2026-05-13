import * as FileSystem from 'expo-file-system/legacy';
import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

export type EpubHtmlChapter = {
  id: string;
  title: string;
  href: string;
  html: string;
};

export type EpubHtmlBook = {
  chapters: EpubHtmlChapter[];
  css: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

const textDecoder = new TextDecoder();

export async function loadEpubHtmlBook(fileUri: string): Promise<EpubHtmlBook> {
  const bytes = await readFileAsBytes(fileUri);
  const zip = unzipSync(bytes);
  const container = readZipText(zip, 'META-INF/container.xml');
  const rootfile = findRootfilePath(container);
  if (!rootfile) return { chapters: [], css: '' };

  const opf = readZipText(zip, rootfile);
  const opfDir = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '';
  const pkg = parser.parse(opf).package;
  const manifestItems = toArray<any>(pkg?.manifest?.item);
  const spineRefs = toArray<any>(pkg?.spine?.itemref);
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]));
  const css = manifestItems
    .filter((item) => item['media-type'] === 'text/css' && item.href)
    .map((item) => readZipText(zip, normalizeZipPath(`${opfDir}${item.href}`)))
    .join('\n');

  const toc = readToc(zip, opfDir, manifestItems, pkg?.spine?.toc);
  const tocByHref = new Map(toc.map((item) => [normalizeHrefKey(item.href), item.title]));

  const chapters = spineRefs
    .map((ref, spineIndex) => {
      const item = manifestById.get(ref.idref);
      if (!item?.href || item['media-type'] !== 'application/xhtml+xml') return null;
      const href = normalizeZipPath(`${opfDir}${item.href}`);
      const html = readZipText(zip, href);
      if (!html) return null;
      const title = tocByHref.get(normalizeHrefKey(item.href)) ?? tocByHref.get(normalizeHrefKey(href)) ?? `章节 ${spineIndex + 1}`;
      const body = extractBodyHtml(html);
      const rewritten = rewriteResourceLinks(body, zip, href);
      return {
        id: href,
        title,
        href: item.href,
        html: rewritten,
      };
    })
    .filter((chapter): chapter is EpubHtmlChapter => Boolean(chapter));

  return { chapters, css };
}

function readToc(zip: Record<string, Uint8Array>, opfDir: string, manifestItems: any[], tocId?: string) {
  const ncxItem = tocId ? manifestItems.find((item) => item.id === tocId) : null;
  const navItem = manifestItems.find((item) => String(item.properties ?? '').split(/\s+/).includes('nav'));
  const tocPath = ncxItem?.href ?? navItem?.href;
  if (!tocPath) return [];
  const tocXml = readZipText(zip, normalizeZipPath(`${opfDir}${tocPath}`));
  if (!tocXml) return [];
  const parsed = parser.parse(tocXml);

  if (parsed.ncx?.navMap?.navPoint) {
    return flattenNavPoints(toArray<any>(parsed.ncx.navMap.navPoint)).map((point) => ({
      title: textValue(point.navLabel?.text) || '未命名章节',
      href: point.content?.src ?? '',
    }));
  }

  const navs = toArray<any>(parsed.html?.body?.nav);
  const tocNav = navs.find((nav) => nav.type === 'toc' || nav['epub:type'] === 'toc') ?? navs[0];
  return flattenNavLinks(toArray<any>(tocNav?.ol?.li));
}

function flattenNavPoints(points: any[]): any[] {
  return points.flatMap((point) => [point, ...flattenNavPoints(toArray(point.navPoint))]);
}

function flattenNavLinks(items: any[]): { title: string; href: string }[] {
  return items.flatMap((item) => {
    const link = item.a ?? item.span;
    const current = link?.href
      ? [{ title: textValue(link) || '未命名章节', href: link.href }]
      : [];
    return [...current, ...flattenNavLinks(toArray(item.ol?.li))];
  });
}

function extractBodyHtml(html: string) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match?.[1] ?? html;
}

function rewriteResourceLinks(html: string, zip: Record<string, Uint8Array>, sourcePath: string) {
  const dir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) : '';
  return html.replace(/\s(?:src|href)=["']([^"']+)["']/gi, (full, rawUrl: string) => {
    if (/^(?:https?:|data:|#)/i.test(rawUrl)) return full;
    const [path, suffix = ''] = rawUrl.split(/(?=[?#])/);
    const zipPath = normalizeZipPath(`${dir}${path}`);
    const bytes = zip[zipPath];
    if (!bytes) return full;
    const mime = mimeTypeForPath(zipPath);
    if (!mime) return full;
    return full.replace(rawUrl, `data:${mime};base64,${uint8ToBase64(bytes)}${suffix}`);
  });
}

function readZipText(zip: Record<string, Uint8Array>, path: string) {
  const file = zip[normalizeZipPath(path)];
  return file ? textDecoder.decode(file) : '';
}

function findRootfilePath(containerXml: string) {
  if (!containerXml) return null;
  const container = parser.parse(containerXml);
  const rootfiles = toArray<any>(container.container?.rootfiles?.rootfile);
  return rootfiles[0]?.['full-path'] ?? null;
}

function normalizeZipPath(path: string) {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function normalizeHrefKey(href: string) {
  return normalizeZipPath(href.split('#')[0].replace(/^(\.\.\/)+/, ''));
}

function textValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return textValue(value[0]);
  if (typeof value === 'object') {
    const object = value as { '#text'?: string };
    return object['#text']?.trim();
  }
  return undefined;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function mimeTypeForPath(path: string) {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'css') return 'text/css';
  return null;
}

async function readFileAsBytes(fileUri: string) {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToUint8(base64);
}

function base64ToUint8(base64: string) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/=+$/, '');
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (const char of clean) {
    const value = chars.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = (buffer >> bits) & 0xff;
    }
  }

  return output.subarray(0, index);
}

function uint8ToBase64(bytes: Uint8Array) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let index = 0;

  for (; index + 2 < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output += chars[(chunk >> 18) & 63] + chars[(chunk >> 12) & 63] + chars[(chunk >> 6) & 63] + chars[chunk & 63];
  }

  if (index < bytes.length) {
    let chunk = bytes[index] << 16;
    output += chars[(chunk >> 18) & 63];
    if (index + 1 < bytes.length) {
      chunk |= bytes[index + 1] << 8;
      output += chars[(chunk >> 12) & 63] + chars[(chunk >> 6) & 63] + '=';
    } else {
      output += chars[(chunk >> 12) & 63] + '==';
    }
  }

  return output;
}
