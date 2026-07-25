import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useSidebar } from "../context/SidebarContext.js";
import { useAuth } from "../context/AuthContext.js";
import {
  CalendarIcon,
  BoxIcon,
  CreditCardIcon,
  GridIcon,
  HorizontalDotsIcon,
  ListIcon,
  PhoneIcon,
  UserGroupIcon,
  UserIcon,
} from "../icons/index.js";

interface NavItem {
  name: string;
  path: string;
  icon: ReactNode;
}

const mainNav: NavItem[] = [
  { name: "Dashboard", path: "/admin/dashboard", icon: <GridIcon /> },
  { name: "AgriSense Full", path: "/agrisense", icon: <BoxIcon /> },
  { name: "Pest Risk", path: "/pest-risk", icon: <SearchSidebarIcon /> },
  { name: "Live Weather", path: "/agrisense?stage=weather", icon: <SearchSidebarIcon /> },
  { name: "RAG Evidence", path: "/agrisense?stage=evidence", icon: <SearchSidebarIcon /> },
  { name: "Crop Ranking", path: "/agrisense?stage=crop_ranking", icon: <BoxIcon /> },
  { name: "Season Plan", path: "/agrisense?stage=season_plan", icon: <CalendarIcon /> },
  { name: "Fertilizer Scheduler", path: "/agrisense?stage=scheduler", icon: <CalendarIcon /> },
  { name: "Financial Projection", path: "/finance?view=math", icon: <CreditCardIcon /> },
  { name: "Finance Management", path: "/finance?view=management", icon: <CreditCardIcon /> },
  { name: "Scenario Simulation", path: "/agrisense?stage=scenario", icon: <ListIcon /> },
  { name: "Marketplace Intel", path: "/marketplace", icon: <MarketplaceIcon /> },
  { name: "Agent Trace", path: "/agrisense?stage=trace", icon: <ListIcon /> },
  { name: "Agent Intake", path: "/agent-intake", icon: <ListIcon /> },
  { name: "Proactive Advice", path: "/temporal", icon: <CalendarIcon /> },
  { name: "BDApps Payments", path: "/payments", icon: <CreditCardIcon /> },
  { name: "BDApps", path: "/bdapps", icon: <PhoneIcon /> },
  { name: "Knowledge Base", path: "/knowledge-base", icon: <BoxIcon /> },
  { name: "Onboarding Requests", path: "/admin/onboarding", icon: <UserGroupIcon /> },
  { name: "Users", path: "/users", icon: <UserGroupIcon /> },
  { name: "Profile", path: "/profile", icon: <UserIcon /> },
];

const otherNav: NavItem[] = [
  { name: "Season Calendar", path: "/calendar", icon: <CalendarIcon /> },
];

// Farmer (user) — same feature pages as the admin, minus admin-only management.
const userNav: NavItem[] = [
  { name: "AgriSense Full", path: "/agrisense", icon: <BoxIcon /> },
  { name: "Pest Risk", path: "/pest-risk", icon: <SearchSidebarIcon /> },
  { name: "Live Weather", path: "/agrisense?stage=weather", icon: <SearchSidebarIcon /> },
  { name: "RAG Evidence", path: "/agrisense?stage=evidence", icon: <SearchSidebarIcon /> },
  { name: "Crop Ranking", path: "/agrisense?stage=crop_ranking", icon: <BoxIcon /> },
  { name: "Season Plan", path: "/agrisense?stage=season_plan", icon: <CalendarIcon /> },
  { name: "Fertilizer Scheduler", path: "/agrisense?stage=scheduler", icon: <CalendarIcon /> },
  { name: "Financial Projection", path: "/finance?view=math", icon: <CreditCardIcon /> },
  { name: "Finance Management", path: "/finance?view=management", icon: <CreditCardIcon /> },
  { name: "Scenario Simulation", path: "/agrisense?stage=scenario", icon: <ListIcon /> },
  { name: "Marketplace Intel", path: "/marketplace", icon: <MarketplaceIcon /> },
  { name: "Proactive Advice", path: "/temporal", icon: <CalendarIcon /> },
  { name: "Profile", path: "/profile", icon: <UserIcon /> },
];

// Tenant — the tenant workbench.
const tenantNav: NavItem[] = [
  { name: "টেন্যান্ট ড্যাশবোর্ড", path: "/tenant/dashboard", icon: <GridIcon /> },
];

export default function AppSidebar() {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { user } = useAuth();
  const location = useLocation();

  const role = user?.role ?? "user";
  const primaryNav = role === "admin" ? mainNav : role === "tenant" ? tenantNav : userNav;
  const showOthers = role === "admin";

  const showText = isExpanded || isHovered || isMobileOpen;
  const currentPath = `${location.pathname}${location.search}`;
  const isActive = (path: string) => (path.includes("?") ? currentPath === path : location.pathname === path && !location.search);

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
          AS
        </span>
        {showText && (
          <span className="text-lg font-semibold text-gray-800 dark:text-white/90">
            AgriSense
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
          {renderItems(primaryNav)}
        </div>
        {showOthers && (
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
        )}
      </nav>
    </aside>
  );
}

function SearchSidebarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function MarketplaceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16l-1.5 13h-13L4 7Z" />
      <path d="M8 7a4 4 0 0 1 8 0" />
      <path d="M9 13h6" />
      <path d="M12 10v6" />
    </svg>
  );
}
