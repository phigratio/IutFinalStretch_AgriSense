import { useCallback, useEffect, useState, type FormEvent } from "react";
import { listUsers, createUser, deleteUser, type User } from "../../api/users.js";
import { useAuth } from "../../context/AuthContext.js";
import { PlusIcon, TrashIcon } from "../../icons/index.js";

export default function UsersTable() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setUsers((prev) => [created, ...prev]);
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
    }
  }

  const inputClass =
    "h-11 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 p-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Users</h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {users.length} registered · live from the auth database
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-60 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 border-b border-gray-200 p-5 dark:border-gray-800 sm:flex-row"
      >
        <input
          className={inputClass}
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className={inputClass}
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={inputClass}
          type="password"
          placeholder="Password (8+ chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          <PlusIcon width={16} height={16} />
          {submitting ? "Adding…" : "Add user"}
        </button>
      </form>

      {error && (
        <p className="border-b border-gray-200 px-5 py-3 text-sm text-error-500 dark:border-gray-800">
          {error}
        </p>
      )}

      <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Provider</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                  No users yet. Add one above.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-600 dark:bg-brand-500/15">
                          {u.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-gray-800 dark:text-white/90">
                          {u.name}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-gray-400">
                              (you)
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                      {u.email}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.provider === "oauth"
                            ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
                            : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                        }`}
                      >
                        {u.provider === "oauth" ? "BDApps" : "Password"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => void handleDelete(u.id)}
                        disabled={isSelf}
                        title={isSelf ? "You cannot delete your own account" : undefined}
                        aria-label={`Delete ${u.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400 dark:hover:bg-error-500/10"
                      >
                        <TrashIcon width={16} height={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
