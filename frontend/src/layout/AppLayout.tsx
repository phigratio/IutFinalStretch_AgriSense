import { Outlet } from "react-router-dom";
import { useSidebar } from "../context/SidebarContext.js";
import AppSidebar from "./AppSidebar.js";
import AppHeader from "./AppHeader.js";
import Backdrop from "./Backdrop.js";

export default function AppLayout() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const expanded = isExpanded || isHovered || isMobileOpen;

  return (
    <div className="min-h-screen">
      <AppSidebar />
      <Backdrop />
      <div
        className={`transition-all duration-300 ${
          expanded ? "lg:ml-72" : "lg:ml-[90px]"
        }`}
      >
        <AppHeader />
        <main className="mx-auto max-w-7xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
