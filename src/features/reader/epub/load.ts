import { Directory, File, Paths } from 'expo-file-system';

import type { Book } from '@/features/library/types';
import { parseTextChapters } from '../text';
import { parseEpubArchive } from './archive';
import { createEpubContent } from './content';
import { createEpubMetadata } from './metadata';

async function readArchive(fileUri: string) {
  return parseEpubArchive(await new File(fileUri).bytes());
}

export async function loadEpubHtmlBook(fileUri: string) {
  return createEpubContent(await readArchive(fileUri));
}

export async function extractEpubDetailMetadata(fileUri: string, bookId?: string) {
  const { metadata, cover } = createEpubMetadata(await readArchive(fileUri));
  if (bookId && cover) {
    const directory = new Directory(Paths.document, 'covers');
    directory.create({ intermediates: true, idempotent: true });
    const extension = cover.path.split('.').pop()?.toLowerCase() || 'jpg';
    const file = new File(directory, `${bookId}.${extension}`);
    file.write(cover.bytes);
    metadata.coverUri = file.uri;
  }
  return metadata;
}

export async function extractEpubMetadata(fileUri: string, bookId: string) {
  const { title, author, coverUri } = await extractEpubDetailMetadata(fileUri, bookId);
  return { title, author, coverUri };
}

export async function loadTextChapters(book: Book) {
  return book.format === 'txt' ? parseTextChapters(await new File(book.fileUri).text()) : [];
}
