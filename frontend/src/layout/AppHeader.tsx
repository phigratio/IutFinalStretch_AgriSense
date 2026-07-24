import { useSidebar } from "../context/SidebarContext.js";
import ThemeToggleButton from "../components/common/ThemeToggleButton.js";
import LanguageToggle from "../components/common/LanguageToggle.js";
import NotificationDropdown from "../components/header/NotificationDropdown.js";
import UserDropdown from "../components/header/UserDropdown.js";
import { CloseIcon, ListIcon, SearchIcon } from "../icons/index.js";

export default function AppHeader() {
  const { toggleSidebar, toggleMobileSidebar, isMobileOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-dark/90">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-1 items-center gap-3">
          <button
            aria-label="Toggle sidebar"
            onClick={() => {
              toggleSidebar();
              toggleMobileSidebar();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05]"
          >
            {isMobileOpen ? <CloseIcon /> : <ListIcon />}
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              <SearchIcon width={18} height={18} />
            </span>
            <input
              type="text"
              placeholder="Search or type command..."
              className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 pl-11 pr-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageToggle compact />
          <ThemeToggleButton />
          <NotificationDropdown />
          <UserDropdown />
        </div>
      </div>
    </header>
  );
}
