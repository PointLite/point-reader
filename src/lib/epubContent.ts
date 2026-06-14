import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

import { normalizeZipPath, readFileAsBytes, readZipText, uint8ToBase64 } from '@/lib/epubBinary';

export type EpubHtmlChapter = {
  id: string;
  title: string;
  href: string;
  html: string;
};

export type EpubTocItem = {
  id: string;
  title: string;
  href: string;
};

export type EpubHtmlBook = {
  chapters: EpubHtmlChapter[];
  toc: EpubTocItem[];
  css: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

export async function loadEpubHtmlBook(fileUri: string): Promise<EpubHtmlBook> {
  const bytes = await readFileAsBytes(fileUri);
  const zip = unzipSync(bytes);
  const container = readZipText(zip, 'META-INF/container.xml');
  const rootfile = findRootfilePath(container);
  if (!rootfile) return { chapters: [], toc: [], css: '' };

  const opf = readZipText(zip, rootfile);
  const opfDir = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '';
  const pkg = parser.parse(opf).package;
  const manifestItems = toArray<any>(pkg?.manifest?.item);
  const spineRefs = toArray<any>(pkg?.spine?.itemref);
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]));
  const css = manifestItems
    .flatMap((item) =>
      item['media-type'] === 'text/css' && item.href
        ? [readZipText(zip, normalizeZipPath(`${opfDir}${item.href}`))]
        : []
    )
    .join('\n');

  const toc = readToc(zip, opfDir, manifestItems, pkg?.spine?.toc);
  const tocByHref = new Map(toc.map((item) => [normalizeHrefKey(item.href), item.title]));

  const chapters = spineRefs
    .flatMap((ref) => {
      const item = manifestById.get(ref.idref);
      if (!item?.href || item['media-type'] !== 'application/xhtml+xml') return [];
      const href = normalizeZipPath(`${opfDir}${item.href}`);
      const html = readZipText(zip, href);
      if (!html) return [];
      const title = tocByHref.get(normalizeHrefKey(item.href)) ?? tocByHref.get(normalizeHrefKey(href)) ?? '';
      const body = extractBodyHtml(html);
      const rewritten = rewriteResourceLinks(body, zip, href);
      return [{
        id: href,
        title: title.trim(),
        href: item.href,
        html: rewritten,
      }];
    });

  const tocItems = toc.flatMap((item, index) => {
    const title = item.title.trim();
    if (!title || !item.href) return [];
    return [{
      id: `${item.href || index}-${index}`,
      title,
      href: item.href,
    }];
  });

  return { chapters, toc: tocItems, css };
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
      title: textValue(point.navLabel?.text) || '',
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
      ? [{ title: textValue(link) || '', href: link.href }]
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

function findRootfilePath(containerXml: string) {
  if (!containerXml) return null;
  const container = parser.parse(containerXml);
  const rootfiles = toArray<any>(container.container?.rootfiles?.rootfile);
  return rootfiles[0]?.['full-path'] ?? null;
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
