import { XMLParser } from 'fast-xml-parser';
import * as FileSystem from 'expo-file-system/legacy';

import { detectFormat } from '@/lib/books';
import { importBookFile } from '@/lib/importBooks';
import type { Book, WebDavEntry } from '@/types/reader';

export type WebDavConfig = {
  url: string;
  username?: string;
  password?: string;
};

function authHeader(config: WebDavConfig) {
  if (!config.username) return undefined;
  return `Basic ${btoa(`${config.username}:${config.password ?? ''}`)}`;
}

function entryName(href: string) {
  const decoded = decodeURIComponent(href.replace(/\/$/, ''));
  return decoded.split('/').filter(Boolean).pop() || decoded || '/';
}

function stringValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return String(value ?? '');
}

function pickProp(propstat: unknown) {
  const propstats = Array.isArray(propstat) ? propstat : [propstat];
  return propstats.find((item: any) => item?.prop)?.prop ?? {};
}

function hasCollectionResourceType(resourceType: unknown): boolean {
  if (!resourceType) return false;
  if (typeof resourceType === 'string') return resourceType.toLowerCase().includes('collection');
  if (Array.isArray(resourceType)) return resourceType.some(hasCollectionResourceType);
  if (typeof resourceType !== 'object') return false;
  const record = resourceType as Record<string, unknown>;
  return Object.keys(record).some((key) => key.toLowerCase() === 'collection')
    || Object.values(record).some(hasCollectionResourceType);
}

function withTrailingSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

function requestUrl(config: WebDavConfig, href?: string) {
  const base = withTrailingSlash(config.url.trim());
  return href ? new URL(href, base).toString() : base;
}

function safeCacheName(name: string) {
  return name.replace(/[/?<>\\:*|"]/g, '_');
}

function isSelfHref(itemHref: string, targetUrl: string) {
  try {
    const target = new URL(targetUrl);
    const item = new URL(itemHref, target);
    return decodeURIComponent(item.pathname.replace(/\/$/, '')) === decodeURIComponent(target.pathname.replace(/\/$/, ''));
  } catch {
    return false;
  }
}

export async function listWebDav(config: WebDavConfig, href?: string): Promise<WebDavEntry[]> {
  const headers: Record<string, string> = { Depth: '1' };
  const authorization = authHeader(config);
  if (authorization) headers.Authorization = authorization;
  const targetUrl = requestUrl(config, href);

  const response = await fetch(targetUrl, {
    method: 'PROPFIND',
    headers,
    body: `<?xml version="1.0"?>
      <d:propfind xmlns:d="DAV:">
        <d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop>
      </d:propfind>`,
  });
  if (!response.ok) throw new Error(`WebDAV 连接失败：${response.status}`);

  const xml = await response.text();
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(xml);
  const responses: any[] = Array.isArray(parsed.multistatus?.response)
    ? parsed.multistatus.response
    : [parsed.multistatus?.response].filter(Boolean);

  const entries: WebDavEntry[] = responses.map((item: any) => {
      const prop = pickProp(item.propstat);
      const href = stringValue(item.href);
      const directory = hasCollectionResourceType(prop?.resourcetype) || href.endsWith('/');
      return {
        name: stringValue(prop?.displayname) || entryName(href),
        href,
        type: directory ? 'directory' : 'file',
        size: Number(prop?.getcontentlength ?? 0),
        modifiedAt: stringValue(prop?.getlastmodified) || undefined,
      } satisfies WebDavEntry;
    });

  return entries
    .filter((entry) => entry.href && !isSelfHref(entry.href, targetUrl))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function importWebDavEntry(config: WebDavConfig, entry: WebDavEntry): Promise<Book | null> {
  if (entry.type === 'directory' || !detectFormat(entry.name)) return null;
  const target = requestUrl(config, entry.href);
  const headers: Record<string, string> = {};
  const authorization = authHeader(config);
  if (authorization) headers.Authorization = authorization;

  const download = FileSystem.createDownloadResumable(target, `${FileSystem.cacheDirectory}${safeCacheName(entry.name)}`, {
    headers,
  });
  const result = await download.downloadAsync();
  return result?.uri ? importBookFile(result.uri, entry.name, 'webdav') : null;
}

export async function importWebDavEntries(
  config: WebDavConfig,
  entries: WebDavEntry[],
  onProgress?: (completed: number, total: number, imported: number) => void
): Promise<Book[]> {
  const files: WebDavEntry[] = [];
  const visited = new Set<string>();

  for (const entry of entries) {
    await collectImportableEntries(config, entry, files, visited);
  }

  const books: Book[] = [];
  for (const [index, file] of files.entries()) {
    const book = await importWebDavEntry(config, file);
    if (book) books.push(book);
    onProgress?.(index + 1, files.length, books.length);
  }

  return books;
}

async function collectImportableEntries(
  config: WebDavConfig,
  entry: WebDavEntry,
  files: WebDavEntry[],
  visited: Set<string>
) {
  const absolute = requestUrl(config, entry.href);
  if (visited.has(absolute)) return;
  visited.add(absolute);

  if (entry.type === 'file') {
    if (detectFormat(entry.name)) files.push(entry);
    return;
  }

  const children = await listWebDav(config, entry.href);
  for (const child of children) {
    await collectImportableEntries(config, child, files, visited);
  }
}
