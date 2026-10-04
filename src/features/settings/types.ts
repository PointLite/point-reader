export type ReadingMode = 'scroll' | 'tap';

export type ReaderColorScheme = 'light' | 'dark' | 'system';

export type AppLanguage = 'zh' | 'en';

export type ReadingSettings = {
  appLanguage: AppLanguage;
  mode: ReadingMode;
  colorScheme: ReaderColorScheme;
  hideScrollbar: boolean;
  swapTapZones: boolean;
  volumeTurnPage: boolean;
  showPageButtons: boolean;
  background: 'white' | 'gray' | 'yellow' | 'green';
  fontFamily: 'system' | 'notoSansCjk' | 'notoSerifCjk' | 'serif' | 'mono';
  fontSize: number;
  paddingScale: number;
  lineHeightScale: number;
  alwaysShowStatusBar: boolean;
  keepAwake: boolean;
  einkOptimization: boolean;
};
