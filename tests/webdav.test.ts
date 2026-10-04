import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWebDavResponse } from '../src/features/webdav/protocol';
import { importDirectoryFiles } from '../src/features/webdav/import-files';
import { sortWebDavEntries } from '../src/features/webdav/browser-model';
import type { WebDavEntry } from '../src/features/webdav/types';
import { bookFixture } from './fixtures';

const file = (href: string): WebDavEntry => ({ href, name: href.split('/').pop() || '', type: 'file' });
const directory = (href: string): WebDavEntry => ({ href, name: href, type: 'directory' });

test('PROPFIND namespace parsing excludes self and keeps folders, sizes and Unicode names', () => {
  const xml = `<d:multistatus xmlns:d="DAV:">
    <d:response><d:href>/library/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
    <d:response><d:href>/library/sub/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
    <d:response><d:href>/library/%E4%B9%A6.epub</d:href><d:propstat><d:prop><d:getcontentlength>1234</d:getcontentlength></d:prop></d:propstat></d:response>
  </d:multistatus>`;
  const entries = parseWebDavResponse(xml, 'https://example.com/library/');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].type, 'directory');
  assert.equal(entries[1].name, '书.epub');
  assert.equal(entries[1].size, 1234);
});

test('recursive import deduplicates overlapping selections and preserves same-name books in different directories', async () => {
  const listing: Record<string, WebDavEntry[]> = {
    '/root/': [directory('/root/sub/'), file('/root/book.epub'), file('/root/readme.md')],
    '/root/sub/': [file('/root/sub/book.epub'), directory('/root/')],
  };
  const imported: string[] = [];
  const progress: number[][] = [];
  const books = await importDirectoryFiles(
    [directory('/root/'), file('/root/sub/book.epub')],
    (href) => new URL(href, 'https://example.com').href,
    async (href) => listing[href],
    async (entry) => {
      imported.push(entry.href);
      return bookFixture({ id: entry.href });
    },
    (...values) => progress.push(values)
  );
  assert.deepEqual(imported.sort(), ['/root/book.epub', '/root/sub/book.epub']);
  assert.equal(books.length, 2);
  assert.deepEqual(progress.at(-1), [2, 2, 2]);
});

test('large imports bound concurrent downloads and report every completed file', async () => {
  let active = 0,
    maximum = 0;
  const books = await importDirectoryFiles(
    Array.from({ length: 8 }, (_, i) => file(`/book${i}.txt`)),
    (href) => href,
    async () => [],
    async (entry) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active -= 1;
      return bookFixture({ id: entry.href });
    }
  );
  assert.equal(books.length, 8);
  assert.equal(maximum, 3);
  assert.deepEqual(
    books.map((book) => book.id),
    Array.from({ length: 8 }, (_, i) => `/book${i}.txt`)
  );
});

test('browser sort always puts directories first, including descending order', () => {
  const entries = [file('/book2.epub'), directory('/sub/'), file('/book10.epub')];
  const sorted = sortWebDavEntries(entries, { field: 'name', direction: 'desc' });
  assert.equal(sorted[0].type, 'directory');
  assert.equal(sorted[1].name, 'book10.epub');
});
