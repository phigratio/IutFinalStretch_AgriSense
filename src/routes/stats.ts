import { Router } from "express";
import { getDefaultAuthStore, type AuthStore } from "../auth/store.js";
import { authenticate } from "../middleware/authenticate.js";

export interface AdminStats {
  totalUsers: number;
  verifiedUsers: number;
  passwordUsers: number;
  oauthUsers: number;
  /** Signups in the last 30 days. */
  recentSignups: number;
  /** Signups per month for the trailing 12 months, oldest first. */
  signupsByMonth: { month: string; count: number }[];
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function buildStats(users: { createdAt: string; emailVerified: boolean; passwordHash?: string }[], now = new Date()): AdminStats {
  // Trailing 12 months, oldest first, keyed as YYYY-M.
  const buckets = new Map<string, number>();
  const labels: { key: string; month: string }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets.set(key, 0);
    labels.push({ key, month: MONTH_LABELS[d.getMonth()]! });
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  let recentSignups = 0;

  for (const user of users) {
    const created = new Date(user.createdAt);
    if (Number.isNaN(created.getTime())) continue;

    if (created >= thirtyDaysAgo) recentSignups++;

    const key = `${created.getFullYear()}-${created.getMonth()}`;
    if (buckets.has(key)) {
      buckets.set(key, buckets.get(key)! + 1);
    }
  }

  return {
    totalUsers: users.length,
    verifiedUsers: users.filter((u) => u.emailVerified).length,
    passwordUsers: users.filter((u) => u.passwordHash).length,
    oauthUsers: users.filter((u) => !u.passwordHash).length,
    recentSignups,
    signupsByMonth: labels.map(({ key, month }) => ({
      month,
      count: buckets.get(key) ?? 0,
    })),
  };
}

export function createStatsRouter(store: AuthStore = getDefaultAuthStore()): Router {
  const router = Router();

  router.get("/", authenticate, async (_req, res) => {
    res.json(buildStats(await store.listUsers()));
  });

  return router;
}

export const statsRouter = createStatsRouter();
