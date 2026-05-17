import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { defaultReadingSettings, loadReadingSettings } from '@/lib/settings';
import type { ReaderColorScheme } from '@/types/reader';

export type AppColors = Record<keyof typeof Colors.light, string>;

export function resolveAppScheme(colorScheme: ReaderColorScheme, systemScheme: 'light' | 'dark') {
  if (colorScheme === 'system') return systemScheme;
  return colorScheme;
}

export function useAppTheme() {
  const nativeColorScheme = useColorScheme();
  const systemScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [colorScheme, setColorScheme] = useState<ReaderColorScheme>(defaultReadingSettings.colorScheme);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      loadReadingSettings().then((settings) => {
        if (mounted) setColorScheme(settings.colorScheme);
      });
      return () => {
        mounted = false;
      };
    }, [])
  );

  return useMemo(() => {
    return appThemeFor(colorScheme, systemScheme);
  }, [colorScheme, systemScheme]);
}

export function appThemeFor(colorScheme: ReaderColorScheme, systemScheme: 'light' | 'dark') {
  const scheme = resolveAppScheme(colorScheme, systemScheme);
  return {
    colors: scheme === 'dark' ? Colors.dark : Colors.light,
    isDark: scheme === 'dark',
    statusBarStyle: scheme === 'dark' ? 'light' as const : 'dark' as const,
  };
}
