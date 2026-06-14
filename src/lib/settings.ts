import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ReadingSettings, SortState } from '@/types/reader';

const SETTINGS_KEY = 'point-reader:settings';
const SORT_KEY = 'point-reader:sort';
const readingSettingsListeners = new Set<(settings: ReadingSettings) => void>();

export const defaultReadingSettings: ReadingSettings = {
  appLanguage: defaultAppLanguage(),
  mode: 'scroll',
  colorScheme: 'system',
  hideScrollbar: false,
  swapTapZones: false,
  volumeTurnPage: false,
  showPageButtons: false,
  background: 'white',
  fontFamily: 'serif',
  fontSize: 23,
  paddingScale: 0,
  lineHeightScale: 1.45,
  alwaysShowStatusBar: false,
  keepAwake: false,
  einkOptimization: false,
};

const defaultSortState: SortState = {
  field: 'title',
  direction: 'asc',
};

export async function loadReadingSettings(): Promise<ReadingSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultReadingSettings;
  const parsed = JSON.parse(raw);
  return { ...defaultReadingSettings, ...parsed, appLanguage: normalizeAppLanguage(parsed.appLanguage) };
}

export async function saveReadingSettings(settings: ReadingSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  readingSettingsListeners.forEach((listener) => listener(settings));
}

export function subscribeReadingSettings(listener: (settings: ReadingSettings) => void) {
  readingSettingsListeners.add(listener);
  return () => {
    readingSettingsListeners.delete(listener);
  };
}

export async function loadSortState(): Promise<SortState> {
  const raw = await AsyncStorage.getItem(SORT_KEY);
  return raw ? { ...defaultSortState, ...JSON.parse(raw) } : defaultSortState;
}

export async function saveSortState(sort: SortState) {
  await AsyncStorage.setItem(SORT_KEY, JSON.stringify(sort));
}

function defaultAppLanguage(): ReadingSettings['appLanguage'] {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  return locale.startsWith('zh') ? 'zh' : 'en';
}

function normalizeAppLanguage(value: unknown): ReadingSettings['appLanguage'] {
  if (value === 'zh' || value === 'en') return value;
  return defaultAppLanguage();
}
