import type { SortState } from '@/features/library/types';
import type { ReadingSettings } from './types';

export const defaultReadingSettings: ReadingSettings = {
  appLanguage: defaultAppLanguage(),
  mode: 'scroll',
  colorScheme: 'system',
  hideScrollbar: false,
  swapTapZones: false,
  volumeTurnPage: false,
  showPageButtons: false,
  background: 'white',
  fontFamily: 'notoSansCjk',
  fontSize: 23,
  paddingScale: 0,
  lineHeightScale: 1.45,
  alwaysShowStatusBar: false,
  keepAwake: false,
  einkOptimization: false,
};

export const defaultSortState: SortState = {
  field: 'title',
  direction: 'asc',
};

function defaultAppLanguage(): ReadingSettings['appLanguage'] {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  return locale.startsWith('zh') ? 'zh' : 'en';
}

function normalizeAppLanguage(value: unknown): ReadingSettings['appLanguage'] {
  if (value === 'zh' || value === 'en') return value;
  return defaultAppLanguage();
}

function normalizeFontFamily(value: unknown): ReadingSettings['fontFamily'] {
  if (
    value === 'system' ||
    value === 'notoSansCjk' ||
    value === 'notoSerifCjk' ||
    value === 'serif' ||
    value === 'mono'
  ) {
    return value;
  }
  return defaultReadingSettings.fontFamily;
}

export function normalizeReadingSettings(value: unknown): ReadingSettings {
  const parsed =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<ReadingSettings>) : {};
  const next = { ...defaultReadingSettings, ...parsed };
  for (const key of Object.keys(defaultReadingSettings) as (keyof ReadingSettings)[]) {
    if (
      typeof next[key] !== typeof defaultReadingSettings[key] ||
      (typeof next[key] === 'number' && !Number.isFinite(next[key]))
    ) {
      Object.assign(next, { [key]: defaultReadingSettings[key] });
    }
  }
  next.appLanguage = normalizeAppLanguage(parsed.appLanguage);
  next.fontFamily = normalizeFontFamily(parsed.fontFamily);
  if (!['scroll', 'tap'].includes(next.mode)) next.mode = defaultReadingSettings.mode;
  if (!['light', 'dark', 'system'].includes(next.colorScheme))
    next.colorScheme = defaultReadingSettings.colorScheme;
  if (!['white', 'gray', 'yellow', 'green'].includes(next.background))
    next.background = defaultReadingSettings.background;
  return next;
}

export function normalizeSortState(value: unknown): SortState {
  const parsed = value && typeof value === 'object' ? (value as Partial<SortState>) : {};
  return {
    field:
      parsed.field && ['updatedAt', 'title', 'author', 'progress'].includes(parsed.field)
        ? parsed.field
        : defaultSortState.field,
    direction: parsed.direction === 'desc' ? 'desc' : 'asc',
  };
}
