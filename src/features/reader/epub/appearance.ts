import type { ReadingSettings } from '@/features/settings/types';
import { readerBackgroundFor, readerForegroundFor } from '../content';
import { webReaderFontFamilyFor } from '../fonts';

export function createEpubCssVars(settings: ReadingSettings, systemColorScheme?: 'light' | 'dark' | null) {
  const padding = Math.round(18 + settings.paddingScale * 18);
  const background = readerBackgroundFor(settings, systemColorScheme);
  const foreground = readerForegroundFor(settings, systemColorScheme);
  const fontFamily = webReaderFontFamilyFor(settings.fontFamily);

  return {
    background,
    foreground,
    fontFamily,
    fontSize: `${settings.fontSize}px`,
    lineHeight: String(settings.lineHeightScale),
    padding: `${padding}px`,
  };
}
