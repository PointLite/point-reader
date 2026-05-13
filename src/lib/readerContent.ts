import * as FileSystem from 'expo-file-system/legacy';

import type { Book, ReaderChapter, ReadingSettings } from '@/types/reader';

export const readerBackgrounds: Record<ReadingSettings['background'], string> = {
  white: '#FFFFFF',
  gray: '#ECEBE6',
  yellow: '#F7F0D6',
  green: '#E8F0DF',
};

export const readerForeground = '#1C1917';

export function fontFamilyFor(setting: ReadingSettings['fontFamily']) {
  if (setting === 'serif') return 'serif';
  if (setting === 'mono') return 'monospace';
  return undefined;
}

export async function loadTextChapters(book: Book): Promise<ReaderChapter[]> {
  if (book.format !== 'txt') {
    return [
      {
        id: 'external-renderer',
        title: book.format.toUpperCase(),
        text: '',
      },
    ];
  }

  const raw = await FileSystem.readAsStringAsync(book.fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  const chunks = normalized
    .split(/\n(?=(第.{1,12}[章节回卷部篇]|Chapter\s+\d+|CHAPTER\s+\d+))/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const source = chunks.length > 1 ? chunks : splitBySize(normalized, 5200);
  return source.map((text, index) => ({
    id: `txt-${index}`,
    title: text.split('\n').find(Boolean)?.slice(0, 32) || `第 ${index + 1} 节`,
    text,
  }));
}

function splitBySize(text: string, size: number) {
  const parts: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    parts.push(text.slice(index, index + size));
  }
  return parts.length ? parts : [''];
}
