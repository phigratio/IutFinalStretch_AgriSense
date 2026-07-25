import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { useAuth } from "../context/AuthContext.js";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <PageMeta title="Profile · AgriSense Admin" description="Your admin profile" />
      <PageBreadcrumb pageTitle="Profile" />

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="flex flex-col items-center gap-5 border-b border-gray-200 pb-6 dark:border-gray-800 sm:flex-row sm:justify-between">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-white">
              {initials}
            </span>
            <div className="text-center sm:text-left">
              <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {user.name}
              </h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              user.emailVerified
                ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500"
                : "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500"
            }`}
          >
            {user.emailVerified ? "Email verified" : "Email not verified"}
          </span>
        </div>

        <div className="mt-6">
          <h5 className="mb-4 text-sm font-semibold text-gray-800 dark:text-white/90">
            Account Information
          </h5>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name" value={user.name} />
            <Field label="Email address" value={user.email} />
            <Field label="User ID" value={user.id} />
            <Field
              label="Email verified"
              value={user.emailVerified ? "Yes" : "No"}
            />
          </div>
        </div>
      </div>
    </>
  );
}
