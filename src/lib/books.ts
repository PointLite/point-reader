import * as FileSystem from 'expo-file-system/legacy';

import { getDb } from '@/lib/db';
import { extractEpubMetadata } from '@/lib/epubMetadata';
import type { Book, BookFormat, SortState } from '@/types/reader';

type BookRow = Omit<Book, 'progress' | 'currentOffset'> & {
  progress: number;
  currentOffset: number;
  currentLocation?: string | null;
};

const sortSql: Record<SortState['field'], string> = {
  updatedAt: 'updatedAt',
  title: 'title COLLATE NOCASE',
  author: 'author COLLATE NOCASE',
  progress: 'progress',
};

function normalizeBook(row: BookRow): Book {
  return {
    ...row,
    progress: Number(row.progress),
    currentOffset: Number(row.currentOffset),
    currentLocation: row.currentLocation ?? null,
  };
}

export async function listBooks(sort: SortState): Promise<Book[]> {
  const db = await getDb();
  const direction = sort.direction === 'asc' ? 'ASC' : 'DESC';
  const rows = await db.getAllAsync<BookRow>(
    `SELECT * FROM books ORDER BY ${sortSql[sort.field]} ${direction}, updatedAt DESC`
  );
  const books = rows.map(normalizeBook);
  await backfillMissingEpubMetadata(books);
  return books;
}

export async function searchBooks(query: string, sort: SortState): Promise<Book[]> {
  const books = await listBooks(sort);
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return books;
  return books.filter((book) =>
    `${book.title} ${book.author}`.toLocaleLowerCase().includes(needle)
  );
}

export async function getBook(id: string): Promise<Book | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id = ?', id);
  return row ? normalizeBook(row) : null;
}

export async function saveBook(book: Book) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO books
      (id, title, author, format, coverUri, fileUri, createdAt, updatedAt, progress, currentChapter, currentOffset, currentLocation, groupId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    book.id,
    book.title,
    book.author,
    book.format,
    book.coverUri,
    book.fileUri,
    book.createdAt,
    book.updatedAt,
    book.progress,
    book.currentChapter,
    book.currentOffset,
    book.currentLocation ?? null,
    book.groupId ?? null
  );
}

export async function updateBookProgress(
  id: string,
  progress: number,
  currentChapter: number,
  currentOffset: number,
  currentLocation?: string | null
) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE books SET progress = ?, currentChapter = ?, currentOffset = ?, currentLocation = COALESCE(?, currentLocation), updatedAt = ? WHERE id = ?',
    Math.max(0, Math.min(1, progress)),
    currentChapter,
    currentOffset,
    currentLocation ?? null,
    Date.now(),
    id
  );
}

export async function deleteBooks(ids: string[]) {
  const db = await getDb();
  for (const id of ids) {
    const book = await getBook(id);
    if (book?.fileUri) {
      await FileSystem.deleteAsync(book.fileUri, { idempotent: true });
    }
    if (book?.coverUri) {
      await FileSystem.deleteAsync(book.coverUri, { idempotent: true });
    }
    await db.runAsync('DELETE FROM books WHERE id = ?', id);
  }
}

export function detectFormat(name: string): BookFormat | null {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'epub' || ext === 'txt' || ext === 'pdf') return ext;
  return null;
}

async function backfillMissingEpubMetadata(books: Book[]) {
  for (const book of books) {
    if (book.format !== 'epub' || book.coverUri) continue;
    try {
      const metadata = await extractEpubMetadata(book.fileUri, book.id);
      if (!metadata.coverUri && !metadata.title && !metadata.author) continue;
      const updated = {
        ...book,
        title: metadata.title || book.title,
        author: metadata.author || book.author,
        coverUri: metadata.coverUri ?? book.coverUri,
      };
      Object.assign(book, updated);
      await saveBook(updated);
    } catch {
      // Some EPUBs omit cover metadata; keep the generated fallback cover.
    }
  }
}
