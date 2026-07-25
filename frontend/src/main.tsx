import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.js";
import { SidebarProvider } from "./context/SidebarContext.js";
import { AuthProvider } from "./context/AuthContext.js";
import { LanguageProvider } from "./context/LanguageContext.js";
import ProtectedRoute from "./components/common/ProtectedRoute.js";
import AppLayout from "./layout/AppLayout.js";
import Dashboard from "./pages/Dashboard.js";
import RoleRoute from "./components/common/RoleRoute.js";
import Users from "./pages/Users.js";
import Profile from "./pages/Profile.js";
import Calendar from "./pages/Calendar.js";
import AgriSense from "./pages/AgriSense.js";
import PestRisk from "./pages/PestRisk.js";
import AgentIntake from "./pages/AgentIntake.js";
import Temporal from "./pages/Temporal.js";
import Marketplace from "./pages/Marketplace.js";
import Finance from "./pages/Finance.js";
import Payments from "./pages/Payments.js";
import Bdapps from "./pages/Bdapps.js";
import SignIn from "./pages/SignIn.js";
import NotFound from "./pages/NotFound.js";
import KnowledgeBase from "./pages/KnowledgeBase.js";
import Onboarding from "./pages/Onboarding.js";
import DashboardLanding from "./components/common/DashboardLanding.js";
import OnboardingGate from "./components/common/OnboardingGate.js";
import TenantDashboard from "./pages/TenantDashboard.js";
import TenantRequests from "./pages/TenantRequests.js";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <SidebarProvider>
              <Routes>
              <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
              {/* Everything inside the panel requires a valid session. */}
              <Route element={<ProtectedRoute />}>
                <Route index path="/" element={<DashboardLanding />} />
                {/* Standalone (no admin chrome) — the farmer's onboarding landing. */}
                <Route path="/onboarding" element={<Onboarding />} />
                {/* Feature pages — shared by admin + farmer (user). Same UI for both.
                    A "user" must finish onboarding first (OnboardingGate); admins pass through. */}
                <Route element={<RoleRoute allow={["admin", "user"]} redirectTo="/" />}>
                  <Route element={<OnboardingGate />}>
                  <Route element={<AppLayout />}>
                    {/* Old farmer dashboard is gone — send it to the AgriSense workbench. */}
                    <Route path="/user/dashboard" element={<Navigate to="/agrisense" replace />} />
                    <Route path="/agrisense" element={<AgriSense />} />
                    <Route path="/pest-risk" element={<PestRisk />} />
                    <Route path="/finance" element={<Finance />} />
                    <Route path="/marketplace" element={<Marketplace />} />
                    <Route path="/temporal" element={<Temporal />} />
                    <Route path="/knowledge-base" element={<KnowledgeBase />} />
                    <Route path="/agent-intake" element={<AgentIntake />} />
                    <Route path="/payments" element={<Payments />} />
                    <Route path="/bdapps" element={<Bdapps />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/profile" element={<Profile />} />
                  </Route>
                  </Route>
                </Route>
                <Route element={<RoleRoute allow={["tenant"]} redirectTo="/" />}>
                  <Route element={<AppLayout />}>
                    <Route path="/tenant/dashboard" element={<TenantDashboard />} />
                  </Route>
                </Route>
                {/* Admin-only management surfaces. */}
                <Route element={<RoleRoute allow={["admin"]} redirectTo="/" />}>
                <Route element={<AppLayout />}>
                  <Route path="/admin/dashboard" element={<Dashboard />} />
                  <Route path="/tenant-requests" element={<TenantRequests />} />
                  <Route path="/admin/onboarding" element={<TenantRequests />} />
                  <Route path="/users" element={<Users />} />
                </Route>
                </Route>
              </Route>
              <Route path="/signin" element={<SignIn />} />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </SidebarProvider>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
