/**
 * Mobile UI language (Bangla / English). Ports the web's translation model: an
 * en/bn table (uiTranslations, kept in lockstep with frontend/src/i18n) plus a
 * t() that maps an English source string to the active language. Default Bangla,
 * like the web. Screens are written in English and get Bangla for free via t().
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { uiTranslations, type UiLanguage } from './uiTranslations';

interface LanguageValue {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  toggleLanguage: () => void;
  /** Translate an English UI string to the active language (falls back to input). */
  t: (text: string) => string;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const byEnglish = new Map(uiTranslations.map((item) => [normalize(item.en), item] as const));
const byBangla = new Map(uiTranslations.map((item) => [normalize(item.bn), item] as const));

function translate(value: string, language: UiLanguage): string {
  const key = normalize(value);
  if (!key) return value;
  const entry = byEnglish.get(key) ?? byBangla.get(key);
  if (!entry) return value;
  return language === 'bn' ? entry.bn : entry.en;
}

const LanguageContext = createContext<LanguageValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<UiLanguage>('bn');
  const toggleLanguage = useCallback(() => setLanguage((prev) => (prev === 'bn' ? 'en' : 'bn')), []);
  const t = useCallback((text: string) => translate(text, language), [language]);
  const value = useMemo<LanguageValue>(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, toggleLanguage, t],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

export type { UiLanguage };
