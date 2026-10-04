import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettingsStore, SETTINGS_KEY } from '../src/features/settings/settings-state';
import { defaultReadingSettings, normalizeSortState } from '../src/features/settings/defaults';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  const keys: string[] = [];
  return {
    keys,
    getItem: async (key: string) => {
      keys.push(key);
      return value;
    },
    setItem: async (key: string, next: string) => {
      keys.push(key);
      value = next;
    },
    read: () => JSON.parse(value || '{}'),
  };
}

test('older settings retain preferences while receiving missing defaults', async () => {
  const storage = memoryStorage(
    JSON.stringify({ appLanguage: 'zh', fontSize: 28, mode: 'tap', fontFamily: 'serif' })
  );
  const store = createSettingsStore(storage);
  const [first, second] = await Promise.all([store.load(), store.load()]);
  assert.strictEqual(first, second);
  assert.equal(storage.keys.length, 1);
  assert.equal(storage.keys[0], SETTINGS_KEY);
  assert.equal(first.fontSize, 28);
  assert.equal(first.mode, 'tap');
  assert.equal(first.fontFamily, 'serif');
  assert.equal(first.hideScrollbar, defaultReadingSettings.hideScrollbar);
});

test('concurrent setting changes merge and writes stay ordered', async () => {
  const storage = memoryStorage();
  const store = createSettingsStore(storage);
  await Promise.all([
    store.update({ fontSize: 30 }),
    store.update({ mode: 'tap' }),
    store.update({ einkOptimization: true }),
  ]);
  assert.equal(storage.read().fontSize, 30);
  assert.equal(storage.read().mode, 'tap');
  assert.equal(storage.read().einkOptimization, true);
  assert.strictEqual(store.getSnapshot(), store.getSnapshot());
});

test('a stale initial read cannot overwrite newly saved settings', async () => {
  let resolveRead!: (raw: string) => void;
  const store = createSettingsStore({
    getItem: () =>
      new Promise<string>((resolve) => {
        resolveRead = resolve;
      }),
    setItem: async () => {},
  });
  const reading = store.load();
  await store.save({ ...defaultReadingSettings, fontSize: 32 });
  resolveRead('{"fontSize":18}');
  assert.equal((await reading).fontSize, 32);
});

test('failed storage writes do not block later writes', async () => {
  const storage = memoryStorage();
  let fail = true;
  const store = createSettingsStore({
    getItem: storage.getItem,
    setItem: async (key, value) => {
      if (fail) {
        fail = false;
        throw new Error('disk full');
      }
      return storage.setItem(key, value);
    },
  });
  await assert.rejects(store.update({ fontSize: 29 }), /disk full/);
  await store.update({ mode: 'tap' });
  assert.equal(storage.read().fontSize, 29);
  assert.equal(storage.read().mode, 'tap');
});

test('invalid legacy preference values fall back to valid settings', async () => {
  const store = createSettingsStore(
    memoryStorage('{"mode":"other","fontSize":null,"fontFamily":"old","keepAwake":"yes"}')
  );
  const settings = await store.load();
  assert.equal(settings.fontSize, defaultReadingSettings.fontSize);
  assert.equal(settings.mode, defaultReadingSettings.mode);
  assert.equal(settings.fontFamily, defaultReadingSettings.fontFamily);
  assert.equal(settings.keepAwake, defaultReadingSettings.keepAwake);
  assert.deepEqual(normalizeSortState({ field: 'unknown', direction: 'DROP' }), {
    field: 'title',
    direction: 'asc',
  });
});

test('focus reloads read the current settings after edits', async () => {
  const store = createSettingsStore(memoryStorage());
  await store.load();
  await store.update({ mode: 'tap', colorScheme: 'dark', appLanguage: 'zh' });
  const settings = await store.load();
  assert.equal(settings.mode, 'tap');
  assert.equal(settings.colorScheme, 'dark');
  assert.equal(settings.appLanguage, 'zh');
});
