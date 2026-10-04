import type { EpubDetailMetadata } from '@/features/reader/epub/metadata';
import { deleteFileIfExists } from '@/shared/files';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { detectFormat, guessAuthor, guessTitle } from './model';

import { saveBook } from '@/features/library/repository';
import type { Book, ImportSource } from '@/features/library/types';
import { extractEpubMetadata } from '@/features/reader/epub/load';

export async function importPickedBooks(): Promise<Book[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/epub+zip', 'application/pdf', 'text/plain', 'application/octet-stream'],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return [];
  const imported = await Promise.all(
    result.assets.map((asset) => importBookFile(asset.uri, asset.name, 'local'))
  );
  return imported.filter((book): book is Book => Boolean(book));
}

export async function importBookFile(
  sourceUri: string,
  name: string,
  _source: ImportSource
): Promise<Book | null> {
  const format = detectFormat(name);
  if (!format) return null;
  const directory = new Directory(Paths.document, 'books');
  directory.create({ intermediates: true, idempotent: true });

  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const target = new File(directory, `${id}.${format}`);
  const targetUri = target.uri;
  await new File(sourceUri).copy(target);
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

  try {
    await saveBook(book);
  } catch (error) {
    deleteFileIfExists(book.fileUri);
    deleteFileIfExists(book.coverUri);
    throw error;
  }
  return book;
}

async function safeExtractEpubMetadata(fileUri: string, id: string): Promise<EpubDetailMetadata> {
  try {
    return await extractEpubMetadata(fileUri, id);
  } catch {
    return {};
  }
}
