import { apiFetch } from "./client.js";

export type FinanceEntryType = "income" | "expense";

export interface FinanceEntry {
  id: string;
  farmId?: string;
  seasonPlanId?: string;
  entryType: FinanceEntryType;
  category: string;
  label: string;
  amountBdt: number;
  entryDate: string;
  season?: string;
  crop?: string;
  source: string;
  metadata?: unknown;
  editable: boolean;
}

export interface FinanceMonthlyRow {
  month: number;
  label: string;
  season: string;
  incomeBdt: number;
  expenseBdt: number;
  profitBdt: number;
  entryCount: number;
}

export interface FinanceAgentInsight {
  severity: "success" | "warning" | "info";
  title: string;
  message: string;
  action: string;
}

export interface FinanceSummary {
  query: {
    farmId?: string;
    seasonPlanId?: string;
    year: number;
    season?: string;
  };
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
    budgetBdt?: number;
    budgetSurplusBdt?: number;
    breakEvenYieldKg?: number;
    breakEvenPriceBdtPerKg?: number;
  };
  monthly: FinanceMonthlyRow[];
  seasons: Array<{
    season: string;
    incomeBdt: number;
    expenseBdt: number;
    profitBdt: number;
    entryCount: number;
  }>;
  entries: FinanceEntry[];
  agentInsights: FinanceAgentInsight[];
  trace: Array<{
    traceId?: string;
    kind: string;
    toolName: string;
    parameters: Record<string, unknown>;
    rawResponse?: unknown;
    status: string;
    latencyMs: number;
  }>;
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
  metadata?: unknown;
}

export function getFinanceSummary(query: {
  farmId?: string;
  seasonPlanId?: string;
  year?: number;
  season?: string;
} = {}): Promise<FinanceSummary> {
  return apiFetch<FinanceSummary>(`/api/finance/summary${queryString(query)}`);
}

export function getFinanceEntries(query: {
  farmId?: string;
  seasonPlanId?: string;
  year?: number;
  season?: string;
  type?: FinanceEntryType;
} = {}): Promise<FinanceEntry[]> {
  return apiFetch<FinanceEntry[]>(`/api/finance/entries${queryString(query)}`);
}

export function createFinanceEntry(input: FinanceEntryInput): Promise<FinanceEntry> {
  return apiFetch<FinanceEntry>("/api/finance/entries", { method: "POST", body: input });
}

export function updateFinanceEntry(id: string, patch: Partial<FinanceEntryInput>): Promise<FinanceEntry> {
  return apiFetch<FinanceEntry>(`/api/finance/entries/${id}`, { method: "PATCH", body: patch });
}

export function deleteFinanceEntry(id: string): Promise<void> {
  return apiFetch<void>(`/api/finance/entries/${id}`, { method: "DELETE" });
}

export function getFinanceAdvice(query: {
  farmId?: string;
  seasonPlanId?: string;
  year?: number;
  season?: string;
}): Promise<Pick<FinanceSummary, "agentInsights" | "trace" | "totals">> {
  return apiFetch<Pick<FinanceSummary, "agentInsights" | "trace" | "totals">>("/api/finance/advice", {
    method: "POST",
    body: query,
  });
}

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}
