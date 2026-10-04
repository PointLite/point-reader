import type { ReadingSettings } from '@/features/settings/types';

export type ReaderFontOption = {
  value: ReadingSettings['fontFamily'];
  labelKey: 'fontSystem' | 'fontNotoSansCjk' | 'fontNotoSerifCjk' | 'fontSerif' | 'fontMono';
  preview: string;
};

export const readerFontOptions: ReaderFontOption[] = [
  { value: 'notoSansCjk', labelKey: 'fontNotoSansCjk', preview: 'Aa 汉 あ' },
  { value: 'notoSerifCjk', labelKey: 'fontNotoSerifCjk', preview: 'Aa 汉 あ' },
  { value: 'system', labelKey: 'fontSystem', preview: 'Aa 汉 あ' },
  { value: 'serif', labelKey: 'fontSerif', preview: 'Aa 汉 あ' },
  { value: 'mono', labelKey: 'fontMono', preview: 'Aa 123' },
];

export function nativeReaderFontFamilyFor(setting: ReadingSettings['fontFamily']) {
  if (setting === 'notoSansCjk') return 'PointReaderNotoSansCJK';
  if (setting === 'notoSerifCjk') return 'PointReaderNotoSerifCJK';
  if (setting === 'serif') return 'serif';
  if (setting === 'mono') return 'monospace';
  return undefined;
}

export function webReaderFontFamilyFor(setting: ReadingSettings['fontFamily']) {
  if (setting === 'notoSansCjk') {
    return "'PointReaderNotoSansCJK', 'NotoSansCJKsc-Regular', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif";
  }
  if (setting === 'notoSerifCjk') {
    return "'PointReaderNotoSerifCJK', 'NotoSerifCJKsc-Regular', 'Noto Serif CJK SC', 'Noto Serif SC', serif";
  }
  if (setting === 'serif') return 'serif';
  if (setting === 'mono') return 'monospace';
  return 'sans-serif';
}
