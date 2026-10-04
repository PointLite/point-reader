import { useEffect } from 'react';

import { useTranslation } from '@/shared/i18n';
import { useAppTheme } from '@/shared/theme/theme';
import { useToast } from '@/shared/ui/app-toast';
import { updateReadingSettings, useReadingSettings } from './store';
import type { ReadingSettings } from './types';

export function useSettingsEditor() {
  const { settings, ready: settingsReady, error } = useReadingSettings();
  const { t } = useTranslation();
  const showToast = useToast();
  const theme = useAppTheme();

  useEffect(() => {
    if (error) showToast(error instanceof Error ? error.message : t('operationFailed'));
  }, [error, showToast, t]);

  async function update(patch: Partial<ReadingSettings>) {
    try {
      await updateReadingSettings(patch);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  }

  return { settings, settingsReady, update, t, ...theme };
}
