import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import Dashboard from "../../pages/Dashboard.js";

/**
 * Landing route. A plain `user` (farmer) is sent to onboarding; admins and tenants
 * see the dashboard. This keeps the admin panel out of a farmer's first experience.
 */
export default function HomeRedirect() {
  const { user } = useAuth();
  if (user && user.role === "user") {
    return <Navigate to="/onboarding" replace />;
  }
  return <Dashboard />;
}
