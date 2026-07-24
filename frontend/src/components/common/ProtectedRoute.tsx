import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Wait for the initial /auth/me check so a valid session isn't bounced to login.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
