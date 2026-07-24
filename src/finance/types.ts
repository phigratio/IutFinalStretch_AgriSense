import { type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { type ContextBundle } from "../context/contextService.js";

export type FinanceEntryType = "income" | "expense";
export type FinanceEntrySource = "manual" | "season_plan" | "payment" | "marketplace" | "agent";

export interface FinanceEntry {
  id: string;
  farmId?: string | null;
  seasonPlanId?: string | null;
  entryType: FinanceEntryType;
  category: string;
  label: string;
  amountBdt: number;
  entryDate: string;
  season?: string | null;
  crop?: string | null;
  source: FinanceEntrySource;
  metadata: Record<string, unknown>;
  editable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinanceMonthlyRow {
  month: number;
  label: string;
  season: string;
  incomeBdt: number;
  expenseBdt: number;
  profitBdt: number;
  projectedIncomeBdt: number;
  projectedExpenseBdt: number;
  actualIncomeBdt: number;
  actualExpenseBdt: number;
  status: "projected" | "actual" | "mixed" | "empty";
  drivers: string[];
  entryCount: number;
}

export interface FinanceSeasonSummary {
  season: string;
  incomeBdt: number;
  expenseBdt: number;
  profitBdt: number;
  entryCount: number;
}

export interface FinanceAgentInsight {
  severity: "info" | "warning" | "success";
  title: string;
  message: string;
  action: string;
  evidence?: string[];
}

export interface FinanceSummary {
  query: FinanceSummaryQuery & { year: number };
  plan?: {
    id: string;
    farmId: string;
    crop: string;
    season?: string;
    expectedYieldKg?: number;
    expectedRevenueBdt: number;
    totalCostBdt: number;
    netProfitBdt: number;
    roiPct: number;
    breakEvenYieldKg?: number;
    breakEvenPriceBdtPerKg?: number;
  };
  totals: {
    totalIncomeBdt: number;
    totalExpenseBdt: number;
    netProfitBdt: number;
    roiPct: number;
    breakEvenYieldKg?: number;
    breakEvenPriceBdtPerKg?: number;
    budgetBdt?: number;
    budgetSurplusBdt?: number;
  };
  monthly: FinanceMonthlyRow[];
  seasons: FinanceSeasonSummary[];
  entries: FinanceEntry[];
  agentInsights: FinanceAgentInsight[];
  context?: ContextBundle;
  trace: IntakeTraceEvent[];
}

export interface FinanceSummaryQuery {
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  seasonPlanId?: string;
  sessionId?: string;
  year?: number;
  season?: string;
}

export interface FinanceEntryInput {
  farmId?: string;
  seasonPlanId?: string;
  entryType: FinanceEntryType;
  category: string;
  label: string;
  amountBdt: number;
  entryDate: string;
  season?: string;
  crop?: string;
  metadata?: Record<string, unknown>;
}
