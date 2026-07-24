import { HorizontalDotsIcon } from "../../icons/index.js";
import type { AdminStats } from "../../api/stats.js";

interface Props {
  stats: AdminStats | null;
}

export default function SignInMethods({ stats }: Props) {
  const total = stats?.totalUsers ?? 0;
  const rows = [
    {
      name: "Email & Password",
      count: stats?.passwordUsers ?? 0,
      icon: "🔑",
    },
    {
      name: "Google OAuth",
      count: stats?.oauthUsers ?? 0,
      icon: "🌐",
    },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Sign-in Methods
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            How your users authenticate
          </p>
        </div>
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <HorizontalDotsIcon />
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {rows.map((r) => {
          const percent = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <div key={r.name} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl leading-none">{r.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                    {r.name}
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {r.count} {r.count === 1 ? "user" : "users"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-9 text-right text-sm font-medium text-gray-700 dark:text-gray-300">
                  {percent}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
