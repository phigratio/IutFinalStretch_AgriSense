import SystemDashboard from "../components/admin/SystemDashboard.js";

// Admin landing (/admin/dashboard): the whole-platform operator view — system
// KPIs, charts, and activity tables. Distinct from the farmer AnalyticsDashboard.
export default function Dashboard() {
  return <SystemDashboard />;
}
