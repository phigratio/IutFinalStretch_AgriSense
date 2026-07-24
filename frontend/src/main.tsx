import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import UserDashboard from "./pages/UserDashboard.js";
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
              {/* Everything inside the panel requires a valid session. */}
              <Route element={<ProtectedRoute />}>
                <Route index path="/" element={<DashboardLanding />} />
                {/* Standalone (no admin chrome) — the farmer's onboarding landing. */}
                <Route path="/onboarding" element={<Onboarding />} />
                {/* Farmer + tenant now share the admin shell (sidebar + header). */}
                <Route element={<RoleRoute allow={["user"]} redirectTo="/" />}>
                  <Route element={<AppLayout />}>
                    <Route path="/user/dashboard" element={<UserDashboard />} />
                  </Route>
                </Route>
                <Route element={<RoleRoute allow={["tenant"]} redirectTo="/" />}>
                  <Route element={<AppLayout />}>
                    <Route path="/tenant/dashboard" element={<TenantDashboard />} />
                  </Route>
                </Route>
                {/* The whole admin panel is admin-only; non-admins are sent to onboarding. */}
                <Route element={<RoleRoute allow={["admin"]} redirectTo="/" />}>
                <Route element={<AppLayout />}>
                  <Route path="/admin/dashboard" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/tenant-requests" element={<TenantRequests />} />
                  <Route path="/admin/onboarding" element={<TenantRequests />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/agrisense" element={<AgriSense />} />
                  <Route path="/pest-risk" element={<PestRisk />} />
                  <Route path="/knowledge-base" element={<KnowledgeBase />} />
                  <Route path="/agent-intake" element={<AgentIntake />} />
                  <Route path="/temporal" element={<Temporal />} />
                  <Route path="/marketplace" element={<Marketplace />} />
                  <Route path="/finance" element={<Finance />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/bdapps" element={<Bdapps />} />
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
