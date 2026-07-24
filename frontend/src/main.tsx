import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.js";
import { SidebarProvider } from "./context/SidebarContext.js";
import { AuthProvider } from "./context/AuthContext.js";
import ProtectedRoute from "./components/common/ProtectedRoute.js";
import AppLayout from "./layout/AppLayout.js";
import Dashboard from "./pages/Dashboard.js";
import Users from "./pages/Users.js";
import Profile from "./pages/Profile.js";
import Calendar from "./pages/Calendar.js";
import AgriSense from "./pages/AgriSense.js";
import SignIn from "./pages/SignIn.js";
import NotFound from "./pages/NotFound.js";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <SidebarProvider>
            <Routes>
              {/* Everything inside the panel requires a valid session. */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index path="/" element={<Dashboard />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/agrisense" element={<AgriSense />} />
                </Route>
              </Route>
              <Route path="/signin" element={<SignIn />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </SidebarProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
