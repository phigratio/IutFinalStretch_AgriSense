/**
 * Resolve the active color palette. Reads the scheme from ThemeModeProvider
 * (in-app light/dark toggle, defaulting to the device setting), so flipping the
 * toggle re-themes every screen. See theme/theme-mode.tsx.
 */
import { Colors } from '@/constants/theme';
import { useThemeMode } from '@/theme/theme-mode';

export function useTheme() {
  const { scheme } = useThemeMode();
  return Colors[scheme];
}
