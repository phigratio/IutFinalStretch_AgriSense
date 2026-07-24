import { useEffect, useState } from "react";
import PageMeta from "../common/PageMeta.js";
import EcommerceMetrics from "./EcommerceMetrics.js";
import MonthlySignupsChart from "./MonthlySalesChart.js";
import VerifiedAccounts from "./MonthlyTarget.js";
import GrowthChart from "./StatisticsChart.js";
import SignInMethods from "./DemographicCard.js";
import RecentUsers from "./RecentOrders.js";
import { getStats, type AdminStats } from "../../api/stats.js";
import { listUsers, type User } from "../../api/users.js";

/**
 * Live analytics dashboard (metrics, charts, recent users). Shared by the
 * admin dashboard (/admin/dashboard) and the user dashboard (/user/dashboard)
 * so both surfaces render the same widgets from a single source of truth.
 */
export default function AnalyticsDashboard({
  title = "Dashboard · ICT Fest Admin",
  description = "Admin dashboard with live user analytics",
}: {
  title?: string;
  description?: string;
}) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getStats(), listUsers()])
      .then(([nextStats, nextUsers]) => {
        if (cancelled) return;
        setStats(nextStats);
        setUsers(nextUsers);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageMeta title={title} description={description} />

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-4 md:gap-6 xl:col-span-7">
          <EcommerceMetrics stats={stats} />
          <MonthlySignupsChart stats={stats} />
        </div>
        <div className="xl:col-span-5">
          <VerifiedAccounts stats={stats} />
        </div>

        <div className="xl:col-span-7">
          <GrowthChart stats={stats} />
        </div>
        <div className="xl:col-span-5">
          <SignInMethods stats={stats} />
        </div>

        <div className="xl:col-span-12">
          <RecentUsers users={users} loading={loading} />
        </div>
      </div>
    </>
  );
}
