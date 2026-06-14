import { useEffect, useState } from 'react';

import en from '@/languages/en.json';
import zh from '@/languages/zh.json';
import { defaultReadingSettings, loadReadingSettings, subscribeReadingSettings } from '@/lib/settings';
import type { AppLanguage } from '@/types/reader';

type Dictionary = typeof zh;
type ResolvedLanguage = 'zh' | 'en';

export type I18nKey = keyof Dictionary;

const dictionaries: Record<ResolvedLanguage, Dictionary> = { zh, en };

export const supportedAppLanguages = [
  { code: 'zh', labelKey: 'languageZh' },
  { code: 'en', labelKey: 'languageEn' },
] as const satisfies { code: AppLanguage; labelKey: I18nKey }[];

function resolveAppLanguage(language: AppLanguage, locale = getSystemLocale()): ResolvedLanguage {
  return language;
}

function getSystemLocale() {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
}

function translate(
  key: I18nKey,
  values?: Record<string, string | number>,
  resolvedLanguage = resolveAppLanguage(defaultReadingSettings.appLanguage)
) {
  const template = dictionaries[resolvedLanguage][key] ?? zh[key] ?? key;
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''));
}

export function useTranslation() {
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(defaultReadingSettings.appLanguage);

  useEffect(() => {
    let mounted = true;
    loadReadingSettings().then((settings) => {
      if (mounted) setAppLanguage(settings.appLanguage);
    });
    const unsubscribe = subscribeReadingSettings((settings) => {
      setAppLanguage(settings.appLanguage);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const language = resolveAppLanguage(appLanguage);
  const t = (key: I18nKey, values?: Record<string, string | number>) => translate(key, values, language);

  return { t, language, appLanguage };
}
