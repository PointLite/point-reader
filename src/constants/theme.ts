/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const Colors = {
  light: {
    text: '#171717',
    textSecondary: '#57534E',
    background: '#F7F5EF',
    surface: '#FFFFFF',
    surfaceMuted: '#EEEAE1',
    backgroundElement: '#E9E5DA',
    backgroundSelected: '#D8D1C2',
    border: '#C8C1B2',
    accent: '#7C5F2A',
    accentSoft: '#E5D6B5',
    danger: '#8B1E1E',
  },
  dark: {
    text: '#F5F5F4',
    textSecondary: '#D6D3D1',
    background: '#171717',
    surface: '#262626',
    surfaceMuted: '#34312D',
    backgroundElement: '#2F2F2F',
    backgroundSelected: '#44403C',
    border: '#57534E',
    accent: '#D6B36A',
    accentSoft: '#4A3E26',
    danger: '#FCA5A5',
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
