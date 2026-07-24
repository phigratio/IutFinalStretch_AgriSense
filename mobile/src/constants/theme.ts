/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

/**
 * Palette aligned with the team's TailAdmin-style design tokens
 * (brand indigo #465fff, gray scale, success/warning/error accents):
 * screens sit on gray-50, cards are white with gray-200 borders (dark:
 * gray-900 body, gray-dark cards, gray-800 borders).
 */
export const Colors = {
  light: {
    text: '#101828', // gray-900
    textSecondary: '#667085', // gray-500
    background: '#f9fafb', // gray-50 body
    backgroundElement: '#ffffff', // white cards
    backgroundSelected: '#ecf3ff', // brand-50
    border: '#e4e7ec', // gray-200
    brand: '#465fff', // brand-500
    brandSoft: '#ecf3ff', // brand-50
    success: '#039855', // success-600
    successSoft: '#ecfdf3', // success-50
    warning: '#dc6803', // warning-600
    warningSoft: '#fffaeb', // warning-50
    error: '#d92d20', // error-600
    errorSoft: '#fef3f2', // error-50
  },
  dark: {
    text: '#f2f4f7', // gray-100
    textSecondary: '#98a2b3', // gray-400
    background: '#101828', // gray-900 body
    backgroundElement: '#1a2231', // gray-dark cards
    backgroundSelected: '#161950', // brand-950
    border: '#1d2939', // gray-800
    brand: '#7592ff', // brand-400 (contrast on dark)
    brandSoft: '#161950', // brand-950
    success: '#12b76a', // success-500
    successSoft: '#0f2a1e',
    warning: '#f79009', // warning-500
    warningSoft: '#2a1e0b',
    error: '#f04438', // error-500
    errorSoft: '#2a1211',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
