import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getOnboardingMe, type OnboardingMe } from "../../api/onboarding.js";
import { useAuth } from "../../context/AuthContext.js";

export default function DashboardLanding() {
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState<OnboardingMe | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (user?.role === "admin") return;
    getOnboardingMe()
      .then(async (next) => {
        if (next.role !== user?.role) await refreshUser();
        setStatus(next);
      })
      .catch(() => setFailed(true));
  }, [refreshUser, user?.role]);

  if (user?.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (failed) return <Navigate to="/onboarding" replace />;
  if (!status) return <PortalLoader />;
  if (status.role === "tenant") {
    return user?.role === "tenant" ? <Navigate to="/tenant/dashboard" replace /> : <PortalLoader />;
  }
  return <Navigate to={status.profileComplete ? "/agrisense" : "/onboarding"} replace />;
}

export function PortalLoader() {
  return (
    <div className="portal-page grid min-h-dvh place-items-center" role="status" aria-label="লোড হচ্ছে">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
    </div>
  );
}
