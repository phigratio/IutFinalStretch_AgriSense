import { ArrowDownIcon, ArrowUpIcon, BoxIcon, UserGroupIcon } from "../../icons/index.js";
import type { AdminStats } from "../../api/stats.js";

interface Props {
  stats: AdminStats | null;
}

function Badge({ up, value }: { up: boolean; value: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        up
          ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500"
          : "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500"
      }`}
    >
      {up ? <ArrowUpIcon width={12} height={12} /> : <ArrowDownIcon width={12} height={12} />}
      {value}
    </span>
  );
}

function Card({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-800 dark:bg-white/[0.05] dark:text-white/90">
        {icon}
      </div>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
          <h4 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white/90">
            {value}
          </h4>
        </div>
        {badge}
      </div>
    </div>
  );
}

export default function EcommerceMetrics({ stats }: Props) {
  const total = stats?.totalUsers ?? 0;
  const recent = stats?.recentSignups ?? 0;
  // Share of the user base that signed up in the last 30 days.
  const growth = total > 0 ? Math.round((recent / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6">
      <Card
        icon={<UserGroupIcon />}
        label="Total Users"
        value={stats ? total.toLocaleString() : "—"}
        badge={stats ? <Badge up={recent > 0} value={`${growth}%`} /> : undefined}
      />
      <Card
        icon={<BoxIcon />}
        label="New (30 days)"
        value={stats ? recent.toLocaleString() : "—"}
        badge={
          stats ? <Badge up={recent > 0} value={recent > 0 ? "Active" : "Idle"} /> : undefined
        }
      />
    </div>
  );
}
