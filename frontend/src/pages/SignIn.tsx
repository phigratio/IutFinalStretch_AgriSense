import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import PageMeta from "../components/common/PageMeta.js";
import GridShape from "../components/common/GridShape.js";
import LanguageToggle from "../components/common/LanguageToggle.js";
import { useAuth } from "../context/AuthContext.js";
import { googleLoginUrl } from "../api/auth.js";

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
      <div className="grid min-h-screen lg:grid-cols-2">
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle />
        </div>
        <div className="flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <h1 className="mb-2 text-2xl font-bold text-gray-800 dark:text-white/90">
              {mode === "login" ? "Sign In" : "Create account"}
            </h1>
            <p className="mb-8 text-sm text-gray-500 dark:text-gray-400">
              {mode === "login"
                ? "Enter your email and password to access the admin panel."
                : "Register the first admin account for the panel."}
            </p>

            <a
              href={googleLoginUrl()}
              className="mb-5 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.03]"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.7 30.1.5 24 .5 14.6.5 6.5 5.8 2.6 13.6l7.8 6c1.9-5.6 7.2-9.6 13.6-9.6Z" />
                <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.6 5.9c4.4-4.1 6.7-10.780 6.7-17.3Z" />
                <path fill="#FBBC05" d="M10.4 28.4a14.5 14.5 0 0 1 0-8.8l-7.8-6a23.5 23.5 0 0 0 0 20.8l7.8-6Z" />
                <path fill="#34A853" d="M24 47.5c6.1 0 11.3-2 15.4-5.5l-7.6-5.9c-2.1 1.4-4.8 2.3-7.8 2.3-6.4 0-11.7-4-13.6-9.6l-7.8 6C6.5 42.2 14.6 47.5 24 47.5Z" />
              </svg>
              Continue with Google
            </a>

            <div className="mb-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
              <span className="text-xs text-gray-400">or</span>
              <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            </div>

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

        <div className="relative hidden items-center justify-center overflow-hidden bg-brand-950 lg:flex">
          <GridShape />
          <div className="relative z-10 text-center">
            <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold text-white">
              IF
            </span>
            <h2 className="text-2xl font-semibold text-white">AgriSense Admin</h2>
            <p className="mt-2 max-w-xs text-sm text-white/60">
              Manage your event, users, and analytics from one place.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
