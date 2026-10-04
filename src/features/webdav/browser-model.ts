import type { WebDavDirectory, WebDavEntry } from '@/features/webdav/types';
import type { useTranslation } from '@/shared/i18n/index';

export const WEBDAV_DIRECTORIES_KEY = 'point-reader:webdav-directories';

export const WEBDAV_SORT_KEY = 'point-reader:webdav-sort';

export type WebDavSortState = {
  field: 'name' | 'modifiedAt';
  direction: 'asc' | 'desc';
};

export const defaultWebDavSort: WebDavSortState = {
  field: 'name',
  direction: 'asc',
};

export const webDavSortLabels = {
  name: 'fileName',
  modifiedAt: 'addTime',
} as const;

export type BrowseState = {
  directory: WebDavDirectory;
  href?: string;
  label: string;
  history: { href?: string; label: string }[];
};

export const emptyDirectoryForm = { name: '', url: '', username: '', password: '' };

export function normalizeDirectoryUrl(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

export function sortWebDavEntries(entries: WebDavEntry[], sort: WebDavSortState) {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    if (sort.field === 'modifiedAt') {
      const left = sortableEntryTime(a.modifiedAt);
      const right = sortableEntryTime(b.modifiedAt);
      if (left !== right) return (left - right) * direction;
    }
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }) * direction;
  });
}

function sortableEntryTime(modifiedAt?: string) {
  if (!modifiedAt) return Number.MAX_SAFE_INTEGER;
  const time = new Date(modifiedAt).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

export function estimateEntryNameWidth(text: string) {
  return Array.from(text).reduce((total, char) => {
    if (/[\u3000-\u9fff\uff00-\uffef]/.test(char)) return total + 17;
    if (/[A-Z0-9]/.test(char)) return total + 10;
    if (/[mwMW]/.test(char)) return total + 12;
    if (/[ilI.,;:'|!]/.test(char)) return total + 5;
    if (/\s/.test(char)) return total + 4;
    return total + 8;
  }, 0);
}

export function entryMetaText(
  entry: WebDavEntry,
  t: ReturnType<typeof useTranslation>['t'],
  language: string
) {
  if (entry.type === 'directory') return formatEntryDate(entry.modifiedAt, language);
  return [
    fileTypeLabel(entry.name, t),
    formatFileSize(entry.size),
    formatEntryDate(entry.modifiedAt, language),
  ]
    .filter(Boolean)
    .join(' · ');
}

function fileTypeLabel(name: string, t: ReturnType<typeof useTranslation>['t']) {
  const ext = name.split('.').pop()?.trim().toUpperCase();
  if (!ext || ext === name.toUpperCase()) return t('file');
  if (ext === 'EPUB' || ext === 'TXT' || ext === 'PDF') return ext;
  return t('typedFile', { type: ext });
}

function formatFileSize(size?: number) {
  if (!Number.isFinite(size) || typeof size !== 'number' || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

function formatEntryDate(modifiedAt?: string, language = 'zh') {
  if (!modifiedAt) return '';
  const date = new Date(modifiedAt);
  if (Number.isNaN(date.getTime())) return '';
  if (language === 'en') {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${minutes}`;
}
