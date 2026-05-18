import { useSyncExternalStore } from 'react';

import { importWebDavEntries, type WebDavConfig } from '@/lib/webdav';
import type { Book, WebDavEntry } from '@/types/reader';

type WebDavImportStatus = 'idle' | 'running' | 'success' | 'error';

export type WebDavImportSnapshot = {
  status: WebDavImportStatus;
  completed: number;
  total: number;
  imported: number;
  message: string | null;
  updatedAt: number;
};

const idleSnapshot: WebDavImportSnapshot = {
  status: 'idle',
  completed: 0,
  total: 0,
  imported: 0,
  message: null,
  updatedAt: 0,
};

let snapshot: WebDavImportSnapshot = idleSnapshot;
let activeImport: Promise<Book[]> | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(next: WebDavImportSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function scheduleClear() {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    if (snapshot.status !== 'running') {
      emit(idleSnapshot);
    }
  }, 4500);
}

export function getWebDavImportSnapshot() {
  return snapshot;
}

export function subscribeWebDavImport(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWebDavImport() {
  return useSyncExternalStore(subscribeWebDavImport, getWebDavImportSnapshot, getWebDavImportSnapshot);
}

export function startWebDavImport(config: WebDavConfig, entries: WebDavEntry[]) {
  if (activeImport) return activeImport;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  emit({
    status: 'running',
    completed: 0,
    total: entries.length,
    imported: 0,
    message: '正在准备导入...',
    updatedAt: Date.now(),
  });

  activeImport = importWebDavEntries(config, entries, (completed, total, imported) => {
    emit({
      status: 'running',
      completed,
      total,
      imported,
      message: null,
      updatedAt: Date.now(),
    });
  })
    .then((books) => {
      emit({
        status: 'success',
        completed: snapshot.total,
        total: snapshot.total,
        imported: books.length,
        message: books.length ? `已导入 ${books.length} 本书` : '未找到可导入的书籍',
        updatedAt: Date.now(),
      });
      scheduleClear();
      return books;
    })
    .catch((error) => {
      emit({
        status: 'error',
        completed: snapshot.completed,
        total: snapshot.total,
        imported: snapshot.imported,
        message: error instanceof Error ? error.message : '导入失败',
        updatedAt: Date.now(),
      });
      scheduleClear();
      throw error;
    })
    .finally(() => {
      activeImport = null;
    });

  return activeImport;
}
