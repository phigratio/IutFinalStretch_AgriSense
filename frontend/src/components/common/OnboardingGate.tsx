import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { getOnboardingMe } from "../../api/onboarding.js";
import { PortalLoader } from "./DashboardLanding.js";

/**
 * Blocks role-"user" accounts from the farmer feature pages until they have a
 * complete onboarding profile — closes the "sign up then skip onboarding" bypass
 * (DashboardLanding only routes "/", not direct navigation to /agrisense etc.).
 * Admin/tenant pass straight through. Fails open on a fetch error to avoid a
 * redirect loop with the onboarding page.
 */
type GateState = "checking" | "allowed" | "onboard";

export default function OnboardingGate() {
  const { user } = useAuth();
  const [state, setState] = useState<GateState>(user?.role === "user" ? "checking" : "allowed");

  useEffect(() => {
    if (user?.role !== "user") {
      setState("allowed");
      return;
    }
    let cancelled = false;
    setState("checking");
    getOnboardingMe()
      .then((me) => { if (!cancelled) setState(me.profileComplete ? "allowed" : "onboard"); })
      .catch(() => { if (!cancelled) setState("allowed"); });
    return () => { cancelled = true; };
  }, [user?.role]);

  if (state === "checking") return <PortalLoader />;
  if (state === "onboard") return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
