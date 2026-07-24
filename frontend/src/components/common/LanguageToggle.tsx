import { useLanguage } from "../../context/LanguageContext.js";

export default function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, toggleLanguage, t } = useLanguage();
  const nextLabel = language === "bn" ? "Switch to English" : "Switch to Bangla";

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={t(nextLabel)}
      title={t(nextLabel)}
      className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]"
    >
      <span data-i18n-skip>{compact ? (language === "bn" ? "EN" : "BN") : language === "bn" ? "English" : "বাংলা"}</span>
    </button>
  );
}
