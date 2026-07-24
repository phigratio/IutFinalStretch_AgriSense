import { apiFetch } from "./client.js";

/** Mirrors AdminStats in src/routes/stats.ts on the backend. */
export interface AdminStats {
  totalUsers: number;
  verifiedUsers: number;
  passwordUsers: number;
  oauthUsers: number;
  recentSignups: number;
  signupsByMonth: { month: string; count: number }[];
}

export function getStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/api/stats");
}
