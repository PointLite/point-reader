import * as FileSystem from 'expo-file-system/legacy';

import type { Book, ReaderChapter, ReadingSettings } from '@/types/reader';

export const readerBackgrounds: Record<ReadingSettings['background'], string> = {
  white: '#FFFFFF',
  gray: '#ECEBE6',
  yellow: '#F7F0D6',
  green: '#E8F0DF',
};

export const readerForeground = '#1C1917';
export const readerNightBackground = '#171717';
export const readerNightForeground = '#F5F5F4';

export function resolveReaderColorScheme(settings: ReadingSettings, systemScheme?: 'light' | 'dark' | null) {
  if (settings.colorScheme === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return settings.colorScheme;
}

export function readerBackgroundFor(settings: ReadingSettings, systemScheme?: 'light' | 'dark' | null) {
  return resolveReaderColorScheme(settings, systemScheme) === 'dark'
    ? readerNightBackground
    : readerBackgrounds[settings.background];
}

export function readerForegroundFor(settings: ReadingSettings, systemScheme?: 'light' | 'dark' | null) {
  return resolveReaderColorScheme(settings, systemScheme) === 'dark' ? readerNightForeground : readerForeground;
}

export function fontFamilyFor(setting: ReadingSettings['fontFamily']) {
  if (setting === 'serif') return 'serif';
  if (setting === 'mono') return 'monospace';
  return undefined;
}

export async function loadTextChapters(book: Book): Promise<ReaderChapter[]> {
  if (book.format !== 'txt') {
    return [];
  }

  const raw = await FileSystem.readAsStringAsync(book.fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  const chunks = normalized
    .split(/\n(?=(第.{1,12}[章节回卷部篇]|Chapter\s+\d+|CHAPTER\s+\d+))/g)
    .flatMap((chunk) => {
      const trimmed = chunk.trim();
      return trimmed ? [trimmed] : [];
    });

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
