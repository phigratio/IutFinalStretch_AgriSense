import AnalyticsDashboard from "../components/ecommerce/AnalyticsDashboard.js";

// Reuses the same live analytics widgets as the admin dashboard
// (/admin/dashboard). The onboarding flow is intentionally left out here.
export default function UserDashboard() {
  return (
    <AnalyticsDashboard
      title="Dashboard · AgriSense"
      description="Live user analytics"
    />
  );
}
