import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useSidebar } from "../context/SidebarContext.js";
import {
  CalendarIcon,
  GridIcon,
  HorizontalDotsIcon,
  UserGroupIcon,
  UserIcon,
} from "../icons/index.js";

interface NavItem {
  name: string;
  path: string;
  icon: ReactNode;
}

const mainNav: NavItem[] = [
  { name: "Dashboard", path: "/", icon: <GridIcon /> },
  { name: "Users", path: "/users", icon: <UserGroupIcon /> },
  { name: "Profile", path: "/profile", icon: <UserIcon /> },
];

const otherNav: NavItem[] = [
  { name: "Calendar", path: "/calendar", icon: <CalendarIcon /> },
];

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const location = useLocation();

  const showText = isExpanded || isHovered || isMobileOpen;
  const isActive = (path: string) => location.pathname === path;

  const renderItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.name}>
          <Link
            to={item.path}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive(item.path)
                ? "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            } ${!showText ? "justify-center" : ""}`}
          >
            <span
              className={
                isActive(item.path)
                  ? "text-brand-500 dark:text-brand-400"
                  : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200"
              }
            >
              {item.icon}
            </span>
            {showText && <span>{item.name}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white px-4 py-6 transition-all duration-300 dark:border-gray-800 dark:bg-gray-dark
        ${showText ? "w-72" : "w-[90px]"}
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
    >
      <div
        className={`mb-8 flex items-center ${showText ? "gap-3 px-1" : "justify-center"}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold text-white">
          IF
        </span>
        {showText && (
          <span className="text-lg font-semibold text-gray-800 dark:text-white/90">
            ICT&nbsp;Fest
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto no-scrollbar">
        <div>
          <h3
            className={`mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 ${
              showText ? "px-3" : "flex justify-center"
            }`}
          >
            {showText ? "Menu" : <HorizontalDotsIcon width={16} height={16} />}
          </h3>
          {renderItems(mainNav)}
        </div>
        <div>
          <h3
            className={`mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 ${
              showText ? "px-3" : "flex justify-center"
            }`}
          >
            {showText ? "Others" : <HorizontalDotsIcon width={16} height={16} />}
          </h3>
          {renderItems(otherNav)}
        </div>
      </nav>
    </aside>
  );
}
