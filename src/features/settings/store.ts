import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import type { SortState } from '@/features/library/types';
import { normalizeSortState } from './defaults';
import { createSettingsStore } from './settings-state';

export { defaultReadingSettings } from './defaults';

const store = createSettingsStore(AsyncStorage);
const SORT_KEY = 'point-reader:sort';

export const loadReadingSettings = store.load;
export const saveReadingSettings = store.save;
export const updateReadingSettings = store.update;

export function useReadingSettings() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.load().catch(() => {});
  }, []);
  return snapshot;
}

export async function loadSortState(): Promise<SortState> {
  const raw = await AsyncStorage.getItem(SORT_KEY);
  return normalizeSortState(raw ? JSON.parse(raw) : null);
}

export async function saveSortState(sort: SortState) {
  await AsyncStorage.setItem(SORT_KEY, JSON.stringify(sort));
}
