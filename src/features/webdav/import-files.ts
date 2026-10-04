import { detectFormat } from '@/features/library/model';
import type { Book } from '@/features/library/types';
import type { WebDavEntry } from './types';

export async function importDirectoryFiles(
  entries: WebDavEntry[],
  resolveHref: (href: string) => string,
  list: (href: string) => Promise<WebDavEntry[]>,
  importFile: (entry: WebDavEntry) => Promise<Book | null>,
  onProgress?: (completed: number, total: number, imported: number) => void
) {
  const files: WebDavEntry[] = [];
  const visited = new Set<string>();

  async function collect(entry: WebDavEntry): Promise<void> {
    const href = resolveHref(entry.href);
    if (visited.has(href)) return;
    visited.add(href);
    if (entry.type === 'file') {
      if (detectFormat(entry.name)) files.push(entry);
    } else {
      const children = await list(entry.href);
      await Promise.all(children.map(collect));
    }
  }

  await Promise.all(entries.map(collect));
  let nextIndex = 0,
    completed = 0,
    imported = 0;
  const results: (Book | null)[] = new Array(files.length).fill(null);
  async function worker() {
    while (nextIndex < files.length) {
      const index = nextIndex++;
      const book = await importFile(files[index]);
      results[index] = book;
      completed += 1;
      if (book) imported += 1;
      onProgress?.(completed, files.length, imported);
    }
  }
  // Bound large recursive imports without changing selection or result order.
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  return results.filter((book): book is Book => Boolean(book));
}
