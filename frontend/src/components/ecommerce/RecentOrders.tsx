import { Link } from "react-router-dom";
import type { User } from "../../api/users.js";

interface Props {
  users: User[];
  loading: boolean;
}

export default function RecentUsers({ users, loading }: Props) {
  const recent = users.slice(0, 5);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Recent Users
        </h3>
        <Link
          to="/users"
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          See all
        </Link>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-y border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="py-3 pr-4 font-medium">Name</th>
              <th className="py-3 pr-4 font-medium">Email</th>
              <th className="py-3 pr-4 font-medium">Provider</th>
              <th className="py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : recent.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-400">
                  No users registered yet.
                </td>
              </tr>
            ) : (
              recent.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                >
                  <td className="py-3.5 pr-4 font-medium text-gray-800 dark:text-white/90">
                    {u.name}
                  </td>
                  <td className="py-3.5 pr-4 text-gray-500 dark:text-gray-400">
                    {u.email}
                  </td>
                  <td className="py-3.5 pr-4 text-gray-500 dark:text-gray-400">
                    {u.provider === "oauth" ? "Google" : "Password"}
                  </td>
                  <td className="py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.emailVerified
                          ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500"
                          : "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500"
                      }`}
                    >
                      {u.emailVerified ? "Verified" : "Pending"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
