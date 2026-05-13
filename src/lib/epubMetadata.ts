import * as FileSystem from 'expo-file-system/legacy';
import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

type EpubMetadata = {
  title?: string;
  author?: string;
  coverUri?: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

const COVER_DIR = `${FileSystem.documentDirectory ?? ''}covers/`;

export async function extractEpubMetadata(fileUri: string, bookId: string): Promise<EpubMetadata> {
  const bytes = await readFileAsBytes(fileUri);
  const zip = unzipSync(bytes);
  const container = readZipText(zip, 'META-INF/container.xml');
  const rootfile = findRootfilePath(container);
  if (!rootfile) return {};

  const opf = readZipText(zip, rootfile);
  const opfDir = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : '';
  const parsed = parser.parse(opf);
  const pkg = parsed.package;
  const metadata = pkg?.metadata ?? {};
  const manifestItems = toArray(pkg?.manifest?.item);
  const title = textValue(metadata['dc:title']);
  const author = textValue(metadata['dc:creator']);
  const coverItem = findCoverItem(metadata, manifestItems);
  const coverPath = coverItem?.href ? normalizeZipPath(`${opfDir}${coverItem.href}`) : null;
  const coverBytes = coverPath ? zip[coverPath] : undefined;
  const coverUri = coverBytes && coverPath ? await writeCoverImage(coverBytes, bookId, coverPath) : null;

  return {
    title,
    author,
    coverUri,
  };
}

function readZipText(zip: Record<string, Uint8Array>, path: string) {
  const file = zip[normalizeZipPath(path)];
  return file ? strFromU8(file) : '';
}

function findRootfilePath(containerXml: string) {
  if (!containerXml) return null;
  const container = parser.parse(containerXml);
  const rootfiles = toArray(container.container?.rootfiles?.rootfile);
  return rootfiles[0]?.['full-path'] ?? null;
}

function findCoverItem(metadata: any, manifestItems: any[]) {
  const metaItems = toArray(metadata?.meta);
  const coverMeta = metaItems.find((item) => item.name === 'cover' && item.content);
  if (coverMeta) {
    const byId = manifestItems.find((item) => item.id === coverMeta.content);
    if (byId) return byId;
  }

  return (
    manifestItems.find((item) => String(item.properties ?? '').split(/\s+/).includes('cover-image')) ??
    manifestItems.find((item) => /cover/i.test(`${item.id ?? ''} ${item.href ?? ''}`) && /^image\//.test(item['media-type'] ?? ''))
  );
}

function textValue(value: unknown) {
  if (!value) return undefined;
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return textValue(value[0]);
  if (typeof value === 'object' && '#text' in value) {
    const text = (value as { '#text'?: string })['#text'];
    return text?.trim();
  }
  return undefined;
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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

async function writeCoverImage(bytes: Uint8Array, bookId: string, path: string) {
  const ext = path.split('.').pop()?.toLowerCase() || 'jpg';
  await ensureCoverDir();
  const coverUri = `${COVER_DIR}${bookId}.${ext}`;
  await FileSystem.writeAsStringAsync(coverUri, uint8ToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return coverUri;
}

async function ensureCoverDir() {
  const info = await FileSystem.getInfoAsync(COVER_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(COVER_DIR, { intermediates: true });
  }
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
