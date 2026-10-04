import { nativeReaderFontFamilyFor } from '@/features/reader/fonts';
import type { ReadingSettings } from '@/features/settings/types';

export const readerBackgrounds: Record<ReadingSettings['background'], string> = {
  white: '#FFFFFF',
  gray: '#ECEBE6',
  yellow: '#F7F0D6',
  green: '#E8F0DF',
};

export const readerForeground = '#1C1917';
const readerNightBackground = '#171717';
const readerNightForeground = '#F5F5F4';

function resolveReaderColorScheme(settings: ReadingSettings, systemScheme?: 'light' | 'dark' | null) {
  if (settings.colorScheme === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return settings.colorScheme;
}

export function readerBackgroundFor(settings: ReadingSettings, systemScheme?: 'light' | 'dark' | null) {
  return resolveReaderColorScheme(settings, systemScheme) === 'dark'
    ? readerNightBackground
    : readerBackgrounds[settings.background];
}

export function readerForegroundFor(settings: ReadingSettings, systemScheme?: 'light' | 'dark' | null) {
  return resolveReaderColorScheme(settings, systemScheme) === 'dark'
    ? readerNightForeground
    : readerForeground;
}

export function fontFamilyFor(setting: ReadingSettings['fontFamily']) {
  return nativeReaderFontFamilyFor(setting);
}
