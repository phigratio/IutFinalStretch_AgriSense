/**
 * Finance client — mirrors frontend/src/api/finance.ts. Season budget vs actuals:
 * income/expense entries, monthly + seasonal roll-ups, plan-derived projections,
 * and agent insights. Farmer-scoped by farmId. Update BOTH sides in one commit.
 */
import { apiFetch } from './client';
import type { TraceEvent } from './types';

export type FinanceEntryType = 'income' | 'expense';

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
  editable: boolean;
}

export interface FinanceAgentInsight {
  severity: 'success' | 'warning' | 'info';
  title: string;
  message: string;
  action: string;
}

export interface FinanceSummary {
  plan?: {
    id: string;
    crop: string;
    season?: string;
    expectedRevenueBdt: number;
    totalCostBdt: number;
    netProfitBdt: number;
    roiPct: number;
  };
  totals: {
    totalIncomeBdt: number;
    totalExpenseBdt: number;
    netProfitBdt: number;
    roiPct: number;
    budgetBdt?: number;
    budgetSurplusBdt?: number;
  };
  seasons: Array<{ season: string; incomeBdt: number; expenseBdt: number; profitBdt: number; entryCount: number }>;
  entries: FinanceEntry[];
  agentInsights: FinanceAgentInsight[];
  trace: TraceEvent[];
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
}

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const rendered = params.toString();
  return rendered ? `?${rendered}` : '';
}

export function getFinanceSummary(query: { farmId?: string; seasonPlanId?: string; year?: number; season?: string } = {}): Promise<FinanceSummary> {
  return apiFetch<FinanceSummary>(`/api/finance/summary${queryString(query)}`);
}

export function createFinanceEntry(input: FinanceEntryInput): Promise<FinanceEntry> {
  return apiFetch<FinanceEntry>('/api/finance/entries', { method: 'POST', body: input });
}
