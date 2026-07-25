import { Router } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";
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

/**
 * System-wide admin analytics (whole platform, not one farmer): entity counts,
 * category distributions, a plans time-series, and recent rows for tables.
 * All aggregates are cast to int/float in SQL so the JSON has no BigInt/Decimal.
 */
export interface LabelCount {
  label: string;
  count: number;
}

export interface SystemStats {
  counts: {
    users: number; farmers: number; farms: number; sessions: number;
    plans: number; alerts: number; payments: number; toolCalls: number;
    suppliers: number; marketOrders: number; kbDocuments: number;
    leafDiagnoses: number; pestAssessments: number; tenants: number;
  };
  totals: { plannedNetProfitBdt: number; paymentsVolumeBdt: number };
  usersByRole: LabelCount[];
  plansByCrop: LabelCount[];
  alertsBySeverity: LabelCount[];
  paymentsByStatus: LabelCount[];
  plansByMonth: { month: string; count: number }[];
  recentPlans: {
    id: string; crop: string; netProfitBdt: number | null; roiPct: number | null;
    riskLevel: string | null; locationText: string | null; createdAt: string;
  }[];
  recentPayments: {
    id: string; mobile: string | null; amountBdt: number | null; status: string;
    receiptNumber: string | null; createdAt: string;
  }[];
  recentAlerts: {
    id: string; alertType: string; severity: string; title: string;
    status: string | null; createdAt: string;
  }[];
}

let prismaSingleton: PrismaClient | undefined;
function getStatsPrisma(): PrismaClient {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not configured");
  prismaSingleton ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  return prismaSingleton;
}

export async function buildSystemStats(prisma: PrismaClient): Promise<SystemStats> {
  const q = <T>(sql: string) => prisma.$queryRawUnsafe(sql) as Promise<T>;

  const [counts] = await q<[SystemStats["counts"]]>(`
    SELECT
      (SELECT count(*) FROM app_users)::int AS users,
      (SELECT count(*) FROM farmer_profiles)::int AS farmers,
      (SELECT count(*) FROM farm_profiles)::int AS farms,
      (SELECT count(*) FROM agent_sessions)::int AS sessions,
      (SELECT count(*) FROM season_plans)::int AS plans,
      (SELECT count(*) FROM proactive_alerts)::int AS alerts,
      (SELECT count(*) FROM bdapps_payments)::int AS payments,
      (SELECT count(*) FROM agent_tool_calls)::int AS "toolCalls",
      (SELECT count(*) FROM marketplace_suppliers)::int AS suppliers,
      (SELECT count(*) FROM marketplace_orders)::int AS "marketOrders",
      (SELECT count(*) FROM kb_documents)::int AS "kbDocuments",
      (SELECT count(*) FROM leaf_diagnoses)::int AS "leafDiagnoses",
      (SELECT count(*) FROM pest_disease_assessments)::int AS "pestAssessments",
      (SELECT count(*) FROM tenants)::int AS tenants
  `);

  const [totals] = await q<[SystemStats["totals"]]>(`
    SELECT
      (SELECT coalesce(sum(net_profit_bdt), 0)::float FROM season_plans) AS "plannedNetProfitBdt",
      (SELECT coalesce(sum(amount_bdt), 0)::float FROM bdapps_payments) AS "paymentsVolumeBdt"
  `);

  const usersByRole = await q<LabelCount[]>(`SELECT coalesce(role, 'unknown') AS label, count(*)::int AS count FROM app_users GROUP BY role ORDER BY count DESC`);
  const plansByCrop = await q<LabelCount[]>(`SELECT crop AS label, count(*)::int AS count FROM season_plans GROUP BY crop ORDER BY count DESC LIMIT 8`);
  const alertsBySeverity = await q<LabelCount[]>(`SELECT coalesce(severity, 'unknown') AS label, count(*)::int AS count FROM proactive_alerts GROUP BY severity ORDER BY count DESC`);
  const paymentsByStatus = await q<LabelCount[]>(`SELECT coalesce(status, 'unknown') AS label, count(*)::int AS count FROM bdapps_payments GROUP BY status ORDER BY count DESC`);
  const plansByMonth = await q<{ month: string; count: number }[]>(`
    SELECT to_char(date_trunc('month', created_at), 'Mon') AS month, count(*)::int AS count
    FROM season_plans WHERE created_at > now() - interval '12 months'
    GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at)
  `);

  const recentPlans = await q<SystemStats["recentPlans"]>(`
    SELECT sp.id::text AS id, sp.crop, sp.net_profit_bdt::float AS "netProfitBdt", sp.roi_pct::float AS "roiPct",
           sp.risk_level AS "riskLevel", fp.location_text AS "locationText", sp.created_at AS "createdAt"
    FROM season_plans sp LEFT JOIN farm_profiles fp ON fp.id = sp.farm_id
    ORDER BY sp.created_at DESC LIMIT 8
  `);
  const recentPayments = await q<SystemStats["recentPayments"]>(`
    SELECT id::text AS id, mobile, amount_bdt::float AS "amountBdt", status, receipt_number AS "receiptNumber", created_at AS "createdAt"
    FROM bdapps_payments ORDER BY created_at DESC LIMIT 8
  `);
  const recentAlerts = await q<SystemStats["recentAlerts"]>(`
    SELECT id::text AS id, alert_type AS "alertType", coalesce(severity,'info') AS severity, title, status, created_at AS "createdAt"
    FROM proactive_alerts ORDER BY created_at DESC LIMIT 8
  `);

  return { counts, totals, usersByRole, plansByCrop, alertsBySeverity, paymentsByStatus, plansByMonth, recentPlans, recentPayments, recentAlerts };
}

export function createStatsRouter(store: AuthStore = getDefaultAuthStore()): Router {
  const router = Router();

  router.get("/", authenticate, async (_req, res) => {
    res.json(buildStats(await store.listUsers()));
  });

  // Whole-system admin analytics (tables + charts).
  router.get("/system", authenticate, async (_req, res, next) => {
    try {
      res.json(await buildSystemStats(getStatsPrisma()));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const statsRouter = createStatsRouter();
