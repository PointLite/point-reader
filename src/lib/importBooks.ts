import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { detectFormat, saveBook } from '@/lib/books';
import { extractEpubMetadata } from '@/lib/epubMetadata';
import type { Book, ImportSource } from '@/types/reader';

const BOOK_DIR = `${FileSystem.documentDirectory ?? ''}books/`;

function cleanName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

function guessAuthor(name: string) {
  const parts = cleanName(name).split(' - ');
  return parts.length > 1 ? parts[0].trim() : '未知作者';
}

function guessTitle(name: string) {
  const parts = cleanName(name).split(' - ');
  return parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleanName(name);
}

export async function ensureBookDir() {
  const info = await FileSystem.getInfoAsync(BOOK_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BOOK_DIR, { intermediates: true });
  }
}

export async function importPickedBooks(): Promise<Book[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/epub+zip',
      'application/pdf',
      'text/plain',
      'application/octet-stream',
    ],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return [];
  const imported = await Promise.all(result.assets.map((asset) => importBookFile(asset.uri, asset.name, 'local')));
  return imported.filter((book): book is Book => Boolean(book));
}

export async function importBookFile(
  sourceUri: string,
  name: string,
  _source: ImportSource
): Promise<Book | null> {
  const format = detectFormat(name);
  if (!format) return null;
  await ensureBookDir();

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const targetUri = `${BOOK_DIR}${id}.${format}`;
  await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  const epubMetadata = format === 'epub' ? await safeExtractEpubMetadata(targetUri, id) : {};

  const now = Date.now();
  const book: Book = {
    id,
    title: epubMetadata.title || guessTitle(name) || '未命名书籍',
    author: epubMetadata.author || guessAuthor(name),
    format,
    coverUri: epubMetadata.coverUri ?? null,
    fileUri: targetUri,
    createdAt: now,
    updatedAt: now,
    progress: 0,
    currentChapter: 0,
    currentOffset: 0,
    currentLocation: null,
    groupId: null,
  };

  await saveBook(book);
  return book;
}

async function safeExtractEpubMetadata(fileUri: string, id: string) {
  try {
    return await extractEpubMetadata(fileUri, id);
  } catch {
    return {};
  }
}
