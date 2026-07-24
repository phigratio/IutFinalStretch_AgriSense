import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";

/**
 * Restricts a group of routes to specific roles. Assumes it runs inside ProtectedRoute
 * (so `user` is present). Anyone without an allowed role is bounced to `redirectTo`.
 */
export default function RoleRoute({ allow, redirectTo }: { allow: Array<"user" | "tenant" | "admin">; redirectTo: string }) {
  const { user } = useAuth();
  if (!user) return null;
  if (!allow.includes(user.role)) return <Navigate to={redirectTo} replace />;
  return <Outlet />;
}
