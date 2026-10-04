import { useCallback } from 'react';

import { defaultReadingSettings, useReadingSettings } from '@/features/settings/store';
import type { AppLanguage } from '@/features/settings/types';
import en from '@/shared/i18n/en.json';
import zh from '@/shared/i18n/zh.json';

type Dictionary = typeof zh;
type ResolvedLanguage = 'zh' | 'en';

export type I18nKey = keyof Dictionary;

const dictionaries: Record<ResolvedLanguage, Dictionary> = { zh, en };

export const supportedAppLanguages = [
  { code: 'zh', labelKey: 'languageZh' },
  { code: 'en', labelKey: 'languageEn' },
] as const satisfies { code: AppLanguage; labelKey: I18nKey }[];

function translate(
  key: I18nKey,
  values?: Record<string, string | number>,
  resolvedLanguage = defaultReadingSettings.appLanguage
) {
  const template = dictionaries[resolvedLanguage][key] ?? zh[key] ?? key;
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
}

export function useTranslation() {
  const {
    settings: { appLanguage },
  } = useReadingSettings();
  const language = appLanguage;
  const t = useCallback(
    (key: I18nKey, values?: Record<string, string | number>) => translate(key, values, language),
    [language]
  );
  return { t, language, appLanguage };
}
