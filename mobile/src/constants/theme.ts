/**
 * AgriSense mobile design tokens — "Terracotta & Sage" (earthen) theme.
 * Warm clay primary, soft sage secondary, cream surfaces, espresso text; light
 * and dark. One source of truth for every screen (see components/ui.tsx). No
 * emojis anywhere — signals come from color + icons.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#2E2117', // espresso
    textSecondary: '#7C6A5B', // muted taupe
    background: '#F6EFE6', // warm cream body
    backgroundElement: '#FFFFFF', // white cards
    backgroundSelected: '#F3E4D8', // terracotta tint (selected)
    border: '#E7DBCB', // warm sand
    brand: '#B4552E', // terracotta (primary)
    brandSoft: '#F4E4DA', // terracotta tint
    secondary: '#5E7C52', // sage green
    secondarySoft: '#E7EDDF', // sage tint
    success: '#4B7A3F', // forest/sage good
    successSoft: '#E7EFE0',
    warning: '#B0721A', // ochre/amber
    warningSoft: '#F6E9D3',
    error: '#A83A2C', // clay-red risk
    errorSoft: '#F4E0DA',
  },
  dark: {
    text: '#F1E7DB',
    textSecondary: '#B7A794',
    background: '#1E1712', // warm near-black
    backgroundElement: '#2A2019', // warm dark card
    backgroundSelected: '#3A2519',
    border: '#3A2E24',
    brand: '#D07A50', // brighter terracotta on dark
    brandSoft: '#3A2419',
    secondary: '#8CA87E', // sage light
    secondarySoft: '#26301F',
    success: '#7FA96E',
    successSoft: '#1F2A18',
    warning: '#D69A45',
    warningSoft: '#2E2411',
    error: '#DD6A58',
    errorSoft: '#2E1612',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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

/** Corner radii — soft, rounded, friendly. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
