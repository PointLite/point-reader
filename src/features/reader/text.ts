import type { Book } from '@/features/library/types';
import type { ReaderChapter } from '@/features/reader/types';

export const INITIAL_TEXT_BLOCKS = 18;

export const TEXT_BLOCK_INCREMENT = 12;

export type TextBlock = {
  id: string;
  chapterIndex: number;
  blockIndex: number;
  title?: string;
  text: string;
};

export type TextScrollRequest = {
  blockIndex: number;
  nonce: number;
};

export function buildTextBlocks(chapters: ReaderChapter[]): TextBlock[] {
  let blockIndex = 0;

  return chapters.flatMap((chapter, chapterIndex) => {
    const pieces = splitTextForVirtualList(chapter.text);
    return pieces.map((text, pieceIndex) => ({
      id: `${chapter.id}-${pieceIndex}`,
      chapterIndex,
      blockIndex: blockIndex++,
      title: pieceIndex === 0 ? chapter.title : undefined,
      text,
    }));
  });
}

function splitTextForVirtualList(text: string) {
  const paragraphs = text.split(/\n{2,}/).flatMap((paragraph) => {
    const trimmed = paragraph.trim();
    return trimmed ? [trimmed] : [];
  });
  const source = paragraphs.length ? paragraphs : [text];
  const blocks: string[] = [];

  for (const paragraph of source) {
    if (paragraph.length <= 1800) {
      blocks.push(paragraph);
      continue;
    }
    for (let index = 0; index < paragraph.length; index += 1600) {
      blocks.push(paragraph.slice(index, index + 1600));
    }
  }

  return blocks.length ? blocks : [''];
}

export function chaptersForSheet(
  format: Book['format'],
  epubToc: ReaderChapter[],
  chapters: ReaderChapter[]
) {
  if (format === 'epub') {
    return epubToc.filter((chapter) => chapter.title.trim().length > 0);
  }

  if (format === 'txt') {
    return chapters.filter((chapter) => chapter.title.trim().length > 0 || chapter.text.trim().length > 0);
  }

  return [];
}

export function parseTextChapters(raw: string): ReaderChapter[] {
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
