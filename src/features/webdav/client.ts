import { deleteFileIfExists } from '@/shared/files';
import { File, Paths } from 'expo-file-system';
import { importDirectoryFiles } from './import-files';
import { parseWebDavResponse } from './protocol';

import { importBookFile } from '@/features/library/import';
import { detectFormat } from '@/features/library/model';
import type { Book } from '@/features/library/types';
import type { WebDavEntry } from '@/features/webdav/types';

export type WebDavConfig = {
  url: string;
  username?: string;
  password?: string;
};

function authHeader(config: WebDavConfig) {
  if (!config.username) return undefined;
  return `Basic ${btoa(`${config.username}:${config.password ?? ''}`)}`;
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
  return parseWebDavResponse(xml, targetUrl);
}

export async function testWebDavConnection(config: WebDavConfig) {
  await listWebDav(config);
}

async function importWebDavEntry(config: WebDavConfig, entry: WebDavEntry): Promise<Book | null> {
  if (entry.type === 'directory' || !detectFormat(entry.name)) return null;
  const target = requestUrl(config, entry.href);
  const headers: Record<string, string> = {};
  const authorization = authHeader(config);
  if (authorization) headers.Authorization = authorization;

  const cacheFile = new File(
    Paths.cache,
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeCacheName(entry.name)}`
  );
  try {
    const downloaded = await File.downloadFileAsync(target, cacheFile, { headers });
    return await importBookFile(downloaded.uri, entry.name, 'webdav');
  } finally {
    deleteFileIfExists(cacheFile.uri);
  }
}

export async function importWebDavEntries(
  config: WebDavConfig,
  entries: WebDavEntry[],
  onProgress?: (completed: number, total: number, imported: number) => void
): Promise<Book[]> {
  return importDirectoryFiles(
    entries,
    (href) => requestUrl(config, href),
    (href) => listWebDav(config, href),
    (entry) => importWebDavEntry(config, entry),
    onProgress
  );
}
