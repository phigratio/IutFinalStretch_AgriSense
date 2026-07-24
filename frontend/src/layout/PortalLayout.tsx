import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import LanguageToggle from "../components/common/LanguageToggle.js";

export default function PortalLayout() {
  const { user, logout } = useAuth();
  const dashboardPath = user?.role === "tenant" ? "/tenant/dashboard" : "/user/dashboard";

  return (
    <div className="portal-page min-h-dvh">
      <header className="portal-header">
        <div className="portal-shell flex h-16 items-center justify-between gap-4">
          <Link to={dashboardPath} className="portal-wordmark shrink-0" aria-label="AgriSense dashboard">
            <span aria-hidden="true">🌾</span> AgriSense
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <LanguageToggle compact />
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user?.role === "tenant" ? "অনুমোদিত টেন্যান্ট" : "কৃষক অ্যাকাউন্ট"}</p>
            </div>
            <button type="button" onClick={logout} className="portal-button portal-button--quiet">
              লগ আউট
            </button>
          </div>
        </div>
      </header>
      <main className="portal-shell py-6 sm:py-10"><Outlet /></main>
      <footer className="portal-shell border-t border-gray-200 py-5 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        AgriSense · কৃষকের তথ্য, সঠিক মানুষের কাছে
      </footer>
    </div>
  );
}
