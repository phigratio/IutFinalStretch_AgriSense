/**
 * App theme mode (light / dark / follow-system) with an in-app toggle. Wraps the
 * whole app in _layout; useTheme() reads the resolved scheme from here, so the
 * toggle instantly re-themes every screen. Defaults to the device setting.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Scheme = 'light' | 'dark';

interface ThemeModeValue {
  mode: ThemeMode;
  scheme: Scheme; // resolved light/dark
  setMode: (mode: ThemeMode) => void;
  toggle: () => void; // flip between light and dark
}

const ThemeModeContext = createContext<ThemeModeValue | undefined>(undefined);

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const os = useColorScheme();
  const osScheme: Scheme = os === 'dark' ? 'dark' : 'light';
  const [mode, setMode] = useState<ThemeMode>('system');
  const scheme: Scheme = mode === 'system' ? osScheme : mode;

  const toggle = useCallback(() => {
    setMode((prev) => {
      const current = prev === 'system' ? osScheme : prev;
      return current === 'dark' ? 'light' : 'dark';
    });
  }, [osScheme]);

  const value = useMemo<ThemeModeValue>(() => ({ mode, scheme, setMode, toggle }), [mode, scheme, toggle]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeValue {
  const ctx = useContext(ThemeModeContext);
  if (!ctx) throw new Error('useThemeMode must be used within a ThemeModeProvider');
  return ctx;
}
