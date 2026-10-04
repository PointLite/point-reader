export type BookFormat = 'epub' | 'txt' | 'pdf';

export type ImportSource = 'local' | 'webdav';

export type SortField = 'updatedAt' | 'title' | 'author' | 'progress';

export type SortDirection = 'asc' | 'desc';

export type Book = {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  coverUri: string | null;
  fileUri: string;
  createdAt: number;
  updatedAt: number;
  progress: number;
  currentChapter: number;
  currentOffset: number;
  currentLocation?: string | null;
  groupId?: string | null;
};

export type BookGroup = {
  id: string;
  name: string;
  createdAt: number;
};

export type SortState = {
  field: SortField;
  direction: SortDirection;
};
