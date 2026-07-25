import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { uiTranslations, type UiLanguage } from "../i18n/uiTranslations.js";

interface LanguageContextValue {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
  toggleLanguage: () => void;
  t: (text: string) => string;
}

const STORAGE_KEY = "agrisense.uiLanguage";
const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);
// Per node: the untranslated source we last saw, and the exact string we wrote.
// `written` lets us tell our own translation apart from a fresh value React set.
const textOriginals = new WeakMap<Text, { original: string; written: string }>();
const attrNames = ["placeholder", "aria-label", "title", "alt"] as const;

const byEnglish = new Map(uiTranslations.map((item) => [normalize(item.en), item]));
const byBangla = new Map(uiTranslations.map((item) => [normalize(item.bn), item]));

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function initialLanguage(): UiLanguage {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "en" || stored === "bn" ? stored : "bn";
}

function translateValue(value: string, language: UiLanguage): string {
  const trimmed = normalize(value);
  if (!trimmed) return value;
  const entry = byEnglish.get(trimmed) ?? byBangla.get(trimmed);
  if (!entry) return value;
  const next = language === "bn" ? entry.bn : entry.en;
  return value.replace(trimmed, next);
}

function shouldSkipNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(parent.closest("script, style, svg, code, pre, textarea, [data-i18n-skip]"));
}

function localizeTextNode(node: Text, language: UiLanguage) {
  if (shouldSkipNode(node)) return;
  const current = node.textContent ?? "";
  const state = textOriginals.get(node);
  // If the node still holds what we last wrote, this is a language switch —
  // re-translate from the stored source. Otherwise React replaced the text, so
  // treat the current value as the new source (don't revert React's update).
  const original = state && current === state.written ? state.original : current;
  const translated = translateValue(original, language);
  textOriginals.set(node, { original, written: translated });
  if (translated !== current) node.textContent = translated;
}

function localizeElement(element: Element, language: UiLanguage) {
  for (const attr of attrNames) {
    const current = element.getAttribute(attr);
    if (!current) continue;
    const originalAttr = `data-i18n-original-${attr}`;
    const original = element.getAttribute(originalAttr) ?? current;
    const translated = translateValue(original, language);
    if (!element.hasAttribute(originalAttr) && translated !== current) element.setAttribute(originalAttr, original);
    if (translated !== current) element.setAttribute(attr, translated);
  }
}

function localizeDom(language: UiLanguage) {
  const root = document.getElementById("root");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) localizeTextNode(walker.currentNode as Text, language);
  root.querySelectorAll("*").forEach((element) => localizeElement(element, language));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>(initialLanguage);

  const setLanguage = useCallback((next: UiLanguage) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLanguageState(next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "bn" ? "en" : "bn");
  }, [language, setLanguage]);

  const t = useCallback((text: string) => translateValue(text, language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.classList.toggle("lang-bn", language === "bn");
    document.documentElement.classList.toggle("lang-en", language === "en");
    localizeDom(language);

    const observer = new MutationObserver(() => localizeDom(language));
    const root = document.getElementById("root");
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...attrNames] });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage, toggleLanguage, t }), [language, setLanguage, toggleLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

