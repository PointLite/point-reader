/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const Colors = {
  light: {
    text: '#141923',
    textSecondary: '#667085',
    background: '#F5F7FA',
    surface: '#FBFCFE',
    surfaceMuted: '#EEF1F5',
    backgroundElement: '#E7ECF2',
    backgroundSelected: '#DDE4ED',
    border: '#D2DAE5',
    accent: '#141923',
    accentSoft: '#E9EDF3',
    danger: '#BE123C',
  },
  dark: {
    text: '#F3F6FA',
    textSecondary: '#B8C2D0',
    background: '#0D1118',
    surface: '#161B24',
    surfaceMuted: '#202735',
    backgroundElement: '#2A3444',
    backgroundSelected: '#394456',
    border: '#4A5568',
    accent: '#F3F6FA',
    accentSoft: '#303847',
    danger: '#FDA4AF',
  },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 4,
  medium: 8,
  large: 12,
} as const;

export const TouchTarget = 48;
