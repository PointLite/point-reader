import type { Book, BookGroup, SortField } from '@/features/library/types';

export type FolderItem = BookGroup & { books: Book[] };

export type ShelfItem =
  { type: 'book'; book: Book } | { type: 'folder'; folder: FolderItem } | { type: 'import' };

export function shelfItemKey(item: ShelfItem) {
  if (item.type === 'book') return item.book.id;
  if (item.type === 'folder') return `folder-${item.folder.id}`;
  return 'import-tile';
}

export const sortLabels: Record<SortField, string> = {
  updatedAt: 'shelfSortRecent',
  title: 'shelfSortTitle',
  author: 'shelfSortAuthor',
  progress: 'shelfSortProgress',
};

export const SORT_POPOVER_WIDTH = 156;
