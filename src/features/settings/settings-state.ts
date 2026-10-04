import { defaultReadingSettings, normalizeReadingSettings } from './defaults';
import type { ReadingSettings } from './types';

export const SETTINGS_KEY = 'point-reader:settings';

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function createSettingsStore(storage: Storage) {
  let snapshot = { settings: defaultReadingSettings, ready: false, error: null as unknown };
  let initialization: Promise<ReadingSettings> | undefined;
  let writes = Promise.resolve();
  let revision = 0;
  const listeners = new Set<() => void>();

  function publish(settings: ReadingSettings, error: unknown = null) {
    snapshot = { settings, ready: true, error };
    listeners.forEach((listener) => listener());
  }

  function load() {
    if (!initialization) {
      const startedAtRevision = revision;
      initialization = storage
        .getItem(SETTINGS_KEY)
        .then((raw) => {
          const settings = normalizeReadingSettings(raw ? JSON.parse(raw) : null);
          if (revision === startedAtRevision) publish(settings);
          return snapshot.settings;
        })
        .catch((error: unknown) => {
          if (revision === startedAtRevision) publish(snapshot.settings, error);
          initialization = undefined;
          throw error;
        });
    }
    return initialization.then(() => snapshot.settings);
  }

  function save(settings: ReadingSettings) {
    revision += 1;
    const next = normalizeReadingSettings(settings);
    publish(next);
    // Serial writes prevent a slower, older update from overwriting a newer one.
    const write = writes.then(() => storage.setItem(SETTINGS_KEY, JSON.stringify(next)));
    writes = write.catch(() => {});
    return write;
  }

  async function update(patch: Partial<ReadingSettings>) {
    await load();
    return save({ ...snapshot.settings, ...patch });
  }

  return {
    load,
    save,
    update,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
