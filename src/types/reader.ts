export type BookFormat = 'epub' | 'txt' | 'pdf';
export type ImportSource = 'local' | 'webdav';
export type ReadingMode = 'scroll' | 'tap';
export type ReaderColorScheme = 'light' | 'dark' | 'system';
export type AppLanguage = 'zh' | 'en';
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

export type ReadingSettings = {
  appLanguage: AppLanguage;
  mode: ReadingMode;
  colorScheme: ReaderColorScheme;
  hideScrollbar: boolean;
  swapTapZones: boolean;
  volumeTurnPage: boolean;
  showPageButtons: boolean;
  background: 'white' | 'gray' | 'yellow' | 'green';
  fontFamily: 'system' | 'serif' | 'mono';
  fontSize: number;
  paddingScale: number;
  lineHeightScale: number;
  alwaysShowStatusBar: boolean;
  keepAwake: boolean;
  einkOptimization: boolean;
};

export type ReaderChapter = {
  id: string;
  title: string;
  text: string;
  href?: string;
};

export type WebDavEntry = {
  name: string;
  href: string;
  type: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
};

export type WebDavDirectory = {
  id: string;
  name: string;
  url: string;
  username?: string;
  password?: string;
  createdAt: number;
  updatedAt: number;
};

export type SortState = {
  field: SortField;
  direction: SortDirection;
};
