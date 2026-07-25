import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import PageMeta from "../components/common/PageMeta.js";
import LanguageToggle from "../components/common/LanguageToggle.js";
import { useAuth } from "../context/AuthContext.js";

export default function SignIn() {
  const { user, loading, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await signup(name.trim(), email.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-700 placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200";

  return (
    <>
      <PageMeta title="Sign In · AgriSense Admin" description="Sign in to the admin panel" />
      <div className="flex min-h-screen items-center justify-center">
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle />
        </div>
        <div className="flex w-full items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <h1 className="mb-2 text-2xl font-bold text-gray-800 dark:text-white/90">
              {mode === "login" ? "Sign In" : "Create account"}
            </h1>
            <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
              {mode === "login"
                ? "Enter your email and password to access the admin panel."
                : "Register the first admin account for the panel."}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "signup" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </label>
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Email
                </label>
                <input
                  className={inputClass}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <input
                  className={inputClass}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>

              {error && <p className="text-sm text-error-500">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="h-11 rounded-lg bg-brand-500 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {submitting
                  ? "Please wait…"
                  : mode === "login"
                    ? "Sign In"
                    : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {mode === "login" ? "Don't have an account? " : "Already registered? "}
              <button
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setError(null);
                }}
                className="font-medium text-brand-500 hover:text-brand-600"
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
