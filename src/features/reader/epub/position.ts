import type { Book } from '@/features/library/types';
import { type EpubHtmlBook } from '@/features/reader/epub/content';
import { clamp } from '@/shared/math';

export function normalizeEpubHref(href?: string | null) {
  if (!href) return '';
  return href.split('#')[0].replace(/^.*\/([^/]+)$/, '$1');
}

export function createEpubScrollLocation(index: number, offset: number, href: string) {
  return `point-reader:epub-scroll:${Math.max(0, Math.round(index))}:${clamp(offset, 0, 1).toFixed(6)}:${encodeURIComponent(href)}`;
}

export function parseEpubScrollLocation(location?: string | null) {
  if (!location?.startsWith('point-reader:epub-scroll:')) return null;
  const match = location.match(/^point-reader:epub-scroll:(\d+):([0-9.]+):(.*)$/);
  if (!match) return null;
  try {
    const index = Number(match[1]),
      offset = Number(match[2]);
    if (!Number.isFinite(index) || !Number.isFinite(offset)) return null;
    return { index, offset: clamp(offset, 0, 1), href: decodeURIComponent(match[3] ?? '') };
  } catch {
    return null;
  }
}

export function progressToEpubPosition(progress: number, chapterCount: number) {
  if (chapterCount <= 0) return { index: 0, offset: 0 };
  const absolute = clamp(progress, 0, 1) * chapterCount;
  const index = Math.min(chapterCount - 1, Math.max(0, Math.floor(absolute)));
  const offset = index === chapterCount - 1 && progress >= 0.999 ? 1 : clamp(absolute - index, 0, 1);
  return { index, offset };
}

export function epubPositionProgress(index: number, offset: number, chapterCount: number) {
  if (chapterCount <= 0) return 0;
  return clamp((index + clamp(offset, 0, 1)) / chapterCount, 0, 1);
}

export function resolveEpubRestorePosition(book: Book, epubBook: EpubHtmlBook) {
  const chapterCount = epubBook.chapters.length;
  if (chapterCount <= 0) return { index: 0, offset: 0 };

  const progressPosition = progressToEpubPosition(book.progress, chapterCount);
  const restoredEpubPosition = parseEpubScrollLocation(book.currentLocation);
  const restoredHrefIndex = epubBook.chapters.findIndex((chapter) =>
    isSameEpubHref(chapter.href, restoredEpubPosition?.href ?? book.currentLocation)
  );
  const locationIndex =
    restoredEpubPosition && restoredEpubPosition.index >= 0 && restoredEpubPosition.index < chapterCount
      ? restoredEpubPosition.index
      : restoredHrefIndex >= 0
        ? restoredHrefIndex
        : Math.round(clamp(book.currentChapter, 0, Math.max(0, chapterCount - 1)));
  const locationOffset =
    restoredEpubPosition?.offset && restoredEpubPosition.offset > 0
      ? restoredEpubPosition.offset
      : book.currentOffset > 0 && book.currentOffset <= 1
        ? book.currentOffset
        : 0;
  const locationProgress = epubPositionProgress(locationIndex, locationOffset, chapterCount);
  const hasMeaningfulProgress = book.progress > 0.015;
  const locationIsBehindProgress = locationProgress + 0.035 < book.progress;
  const locationLooksLikeCover = locationIndex === 0 && locationOffset <= 0.01 && book.progress > 0.025;

  if (hasMeaningfulProgress && (locationIsBehindProgress || locationLooksLikeCover)) {
    return progressPosition;
  }

  return { index: locationIndex, offset: locationOffset };
}

export function isSameEpubHref(first?: string | null, second?: string | null) {
  const parsedSecond = parseEpubScrollLocation(second);
  const normalizedFirst = normalizeEpubHref(first);
  const normalizedSecond = normalizeEpubHref(parsedSecond?.href ?? second);
  return Boolean(normalizedFirst && normalizedSecond && normalizedFirst === normalizedSecond);
}
