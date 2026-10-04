import type { BookFormat } from './types';

export function detectFormat(name: string): BookFormat | null {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'epub' || ext === 'txt' || ext === 'pdf' ? ext : null;
}

export function rebaseDocumentUri(uri: string | null | undefined, documentDirectory: string) {
  if (!uri) return uri ?? null;
  const marker = '/Documents/';
  const markerIndex = uri.indexOf(marker);
  return markerIndex < 0 ? uri : `${documentDirectory}${uri.slice(markerIndex + marker.length)}`;
}

function cleanName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function guessAuthor(name: string) {
  const parts = cleanName(name).split(' - ');
  return parts.length > 1 ? parts[0].trim() : '未知作者';
}

export function guessTitle(name: string) {
  const parts = cleanName(name).split(' - ');
  return parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleanName(name);
}
