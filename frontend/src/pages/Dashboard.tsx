import { useEffect, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import EcommerceMetrics from "../components/ecommerce/EcommerceMetrics.js";
import MonthlySignupsChart from "../components/ecommerce/MonthlySalesChart.js";
import VerifiedAccounts from "../components/ecommerce/MonthlyTarget.js";
import GrowthChart from "../components/ecommerce/StatisticsChart.js";
import SignInMethods from "../components/ecommerce/DemographicCard.js";
import RecentUsers from "../components/ecommerce/RecentOrders.js";
import { getStats, type AdminStats } from "../api/stats.js";
import { listUsers, type User } from "../api/users.js";

export default function Dashboard() {
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
      <PageMeta
        title="Dashboard · ICT Fest Admin"
        description="Admin dashboard with live user analytics"
      />

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
