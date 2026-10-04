import { useReadingSettings } from '@/features/settings/store';
import { useColorScheme } from 'react-native';

import type { ReaderColorScheme } from '@/features/settings/types';
import { Colors } from '@/shared/theme/tokens';

export type AppColors = Record<keyof typeof Colors.light, string>;

function resolveAppScheme(colorScheme: ReaderColorScheme, systemScheme: 'light' | 'dark') {
  if (colorScheme === 'system') return systemScheme;
  return colorScheme;
}

export function useAppTheme() {
  const nativeColorScheme = useColorScheme();
  const systemScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const {
    settings: { colorScheme },
  } = useReadingSettings();

  return appThemeFor(colorScheme, systemScheme);
}

export function appThemeFor(colorScheme: ReaderColorScheme, systemScheme: 'light' | 'dark') {
  const scheme = resolveAppScheme(colorScheme, systemScheme);
  return {
    colors: scheme === 'dark' ? Colors.dark : Colors.light,
    isDark: scheme === 'dark',
    statusBarStyle: scheme === 'dark' ? ('light' as const) : ('dark' as const),
  };
}
