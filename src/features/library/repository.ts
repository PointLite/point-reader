import { deleteFileIfExists } from '@/shared/files';
import { Paths } from 'expo-file-system';
import { rebaseDocumentUri } from './model';

import type { Book, BookGroup, SortState } from '@/features/library/types';
import { extractEpubMetadata } from '@/features/reader/epub/load';
import { getDb } from '@/shared/db';

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
    coverUri: rebaseDocumentUri(row.coverUri, Paths.document.uri),
    fileUri: rebaseDocumentUri(row.fileUri, Paths.document.uri) ?? row.fileUri,
    progress: Number(row.progress),
    currentOffset: Number(row.currentOffset),
    currentLocation: row.currentLocation ?? null,
  };
}

async function persistRebasedBookUris(book: Book, row: BookRow) {
  if (book.fileUri === row.fileUri && book.coverUri === (row.coverUri ?? null)) return;
  const db = await getDb();
  await db.runAsync(
    'UPDATE books SET fileUri = ?, coverUri = ? WHERE id = ?',
    book.fileUri,
    book.coverUri ?? null,
    book.id
  );
}

async function listBooks(sort: SortState): Promise<Book[]> {
  const db = await getDb();
  const direction = sort.direction === 'asc' ? 'ASC' : 'DESC';
  const rows = await db.getAllAsync<BookRow>(
    `SELECT * FROM books ORDER BY ${sortSql[sort.field]} ${direction}, updatedAt DESC`
  );
  const books = rows.map(normalizeBook);
  await Promise.all(books.map((book, index) => persistRebasedBookUris(book, rows[index])));
  await backfillMissingEpubMetadata(books);
  return books;
}

export async function searchBooks(query: string, sort: SortState): Promise<Book[]> {
  const books = await listBooks(sort);
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return books;
  return books.filter((book) => `${book.title} ${book.author}`.toLocaleLowerCase().includes(needle));
}

export async function listGroups(): Promise<BookGroup[]> {
  const db = await getDb();
  return db.getAllAsync<BookGroup>('SELECT * FROM groups ORDER BY createdAt ASC');
}

export async function createGroupForBooks(bookIds: string[], name?: string): Promise<BookGroup> {
  const db = await getDb();
  const now = Date.now();
  const group: BookGroup = {
    id: `${now}-${Math.random().toString(36).slice(2)}`,
    name:
      name?.trim() ||
      `文件夹 ${new Date(now).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`,
    createdAt: now,
  };
  await db.runAsync(
    'INSERT INTO groups (id, name, createdAt) VALUES (?, ?, ?)',
    group.id,
    group.name,
    group.createdAt
  );
  await Promise.all(
    bookIds.map((id) =>
      db.runAsync('UPDATE books SET groupId = ?, updatedAt = ? WHERE id = ?', group.id, now, id)
    )
  );
  return group;
}

export async function updateGroupName(id: string, name: string) {
  const nextName = name.trim();
  if (!nextName) return;
  const db = await getDb();
  await db.runAsync('UPDATE groups SET name = ? WHERE id = ?', nextName, id);
}

export async function clearBooksGroup(bookIds: string[]) {
  const db = await getDb();
  const now = Date.now();
  await Promise.all(
    bookIds.map((id) => db.runAsync('UPDATE books SET groupId = NULL, updatedAt = ? WHERE id = ?', now, id))
  );
}

export async function getBook(id: string): Promise<Book | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id = ?', id);
  if (!row) return null;
  const book = normalizeBook(row);
  await persistRebasedBookUris(book, row);
  return book;
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
  await Promise.all(ids.map((id) => deleteBookById(db, id)));
}

async function deleteBookById(db: Awaited<ReturnType<typeof getDb>>, id: string) {
  const book = await getBook(id);
  deleteFileIfExists(book?.fileUri);
  deleteFileIfExists(book?.coverUri);
  await db.runAsync('DELETE FROM books WHERE id = ?', id);
}

const metadataAttempts = new Map<string, Promise<Awaited<ReturnType<typeof extractEpubMetadata>> | null>>();

async function backfillMissingEpubMetadata(books: Book[]) {
  await Promise.all(
    books.map(async (book) => {
      if (book.format !== 'epub' || book.coverUri) return;
      const key = `${book.id}:${book.fileUri}`;
      let attempt = metadataAttempts.get(key);
      if (!attempt) {
        attempt = extractEpubMetadata(book.fileUri, book.id).catch(() => null);
        metadataAttempts.set(key, attempt);
      }
      const metadata = await attempt;
      if (!metadata) return;
      const updated = {
        ...book,
        title: metadata.title || book.title,
        author: metadata.author || book.author,
        coverUri: metadata.coverUri ?? book.coverUri,
      };
      if (
        updated.title === book.title &&
        updated.author === book.author &&
        updated.coverUri === book.coverUri
      )
        return;
      Object.assign(book, updated);
      const db = await getDb();
      await db.runAsync(
        'UPDATE books SET title = ?, author = ?, coverUri = ? WHERE id = ?',
        updated.title,
        updated.author,
        updated.coverUri,
        book.id
      );
    })
  );
}
