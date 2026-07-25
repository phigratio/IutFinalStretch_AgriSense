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

/** Mirrors SystemStats in src/routes/stats.ts — whole-system admin analytics. */
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

export function getSystemStats(): Promise<SystemStats> {
  return apiFetch<SystemStats>("/api/stats/system");
}
