import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ReadingSettings, SortState } from '@/types/reader';

const SETTINGS_KEY = 'point-reader:settings';
const SORT_KEY = 'point-reader:sort';

export const defaultReadingSettings: ReadingSettings = {
  mode: 'scroll',
  hideScrollbar: true,
  swapTapZones: false,
  volumeTurnPage: false,
  showPageButtons: true,
  background: 'yellow',
  fontFamily: 'serif',
  fontSize: 20,
  paddingScale: 1,
  lineHeightScale: 1.45,
  alwaysShowStatusBar: true,
  keepAwake: true,
};

export const defaultSortState: SortState = {
  field: 'title',
  direction: 'asc',
};

export async function loadReadingSettings(): Promise<ReadingSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  return raw ? { ...defaultReadingSettings, ...JSON.parse(raw) } : defaultReadingSettings;
}

export async function saveReadingSettings(settings: ReadingSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadSortState(): Promise<SortState> {
  const raw = await AsyncStorage.getItem(SORT_KEY);
  return raw ? { ...defaultSortState, ...JSON.parse(raw) } : defaultSortState;
}

export async function saveSortState(sort: SortState) {
  await AsyncStorage.setItem(SORT_KEY, JSON.stringify(sort));
}
