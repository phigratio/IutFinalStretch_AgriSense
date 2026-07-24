import { useSidebar } from "../context/SidebarContext.js";

export default function Backdrop() {
  const { isMobileOpen, closeMobileSidebar } = useSidebar();
  if (!isMobileOpen) return null;

  return (
    <div
      onClick={closeMobileSidebar}
      className="fixed inset-0 z-40 bg-gray-900/50 lg:hidden"
    />
  );
}
