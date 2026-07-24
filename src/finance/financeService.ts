import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import {
  type FinanceAgentInsight,
  type FinanceEntry,
  type FinanceEntrySource,
  type FinanceEntryInput,
  type FinanceEntryType,
  type FinanceMonthlyRow,
  type FinanceSeasonSummary,
  type FinanceSummary,
  type FinanceSummaryQuery,
} from "./types.js";
import { type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { contextHydrator } from "../context/contextService.js";

interface PlanRow {
  id: string;
  farm_id: string;
  crop: string;
  expected_yield: unknown;
  expected_revenue_bdt: unknown;
  total_cost_bdt: unknown;
  net_profit_bdt: unknown;
  roi_pct: unknown;
  break_even_yield: unknown;
  break_even_price_bdt_per_kg: unknown;
  created_at: Date | string;
  farm_budget_bdt: unknown;
  target_season: string | null;
}

interface PlanItemRow {
  id: string;
  title: string;
  item_type: string;
  start_date: Date | string | null;
  total_cost_bdt: unknown;
}

interface ManualEntryRow {
  id: string;
  farm_id: string | null;
  season_plan_id: string | null;
  entry_type: FinanceEntryType;
  category: string;
  label: string;
  amount_bdt: unknown;
  entry_date: Date | string;
  season: string | null;
  crop: string | null;
  source: string;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PaymentRow {
  id: string;
  plan_id: string | null;
  amount_bdt: unknown;
  status: string;
  created_at: Date | string;
}

interface MarketplaceOrderRow {
  id: string;
  farm_id: string | null;
  total_price_bdt: unknown;
  status: string;
  created_at: Date | string;
  item_name: string | null;
}

export interface FinanceDataStore {
  loadProjectionContext(query: FinanceSummaryQuery): Promise<{
    plan?: PlanRow;
    planItems: PlanItemRow[];
    manualEntries: ManualEntryRow[];
    payments: PaymentRow[];
    orders: MarketplaceOrderRow[];
  }>;
  listManualEntries(query: FinanceSummaryQuery & { type?: FinanceEntryType }): Promise<ManualEntryRow[]>;
  createManualEntry(input: FinanceEntryInput): Promise<ManualEntryRow>;
  updateManualEntry(id: string, patch: Partial<FinanceEntryInput>): Promise<ManualEntryRow | undefined>;
  deleteManualEntry(id: string): Promise<boolean>;
  close?(): Promise<void>;
}

export class FinanceService {
  constructor(private readonly store: FinanceDataStore = getDefaultFinanceStore()) {}

  async getSummary(query: FinanceSummaryQuery = {}): Promise<FinanceSummary> {
    const year = query.year ?? new Date().getFullYear();
    const trace: IntakeTraceEvent[] = [];
    const hydratedContext = await contextHydrator.hydrate({
      message: "finance summary and advisory context",
      userId: query.userId,
      tenantId: query.tenantId,
      farmerId: query.farmerId,
      farmId: query.farmId,
      sessionId: query.sessionId,
      cropId: query.season,
      limit: 8,
    });
    trace.push(...hydratedContext.trace);
    const context = await this.store.loadProjectionContext({ ...query, year });
    trace.push(traceEvent("finance.load_sources", { ...query }, {
      hasPlan: Boolean(context.plan),
      planItems: context.planItems.length,
      manualEntries: context.manualEntries.length,
      payments: context.payments.length,
      marketplaceOrders: context.orders.length,
    }));

    const entries = [
      ...entriesFromPlan(context.plan, context.planItems),
      ...context.manualEntries.map(normalizeManualEntry),
      ...context.payments.map((payment) => entryFromPayment(payment, context.plan)),
      ...context.orders.map((order) => entryFromOrder(order, context.plan)),
    ].filter((entry): entry is FinanceEntry => Boolean(entry));

    const filtered = entries.filter((entry) => {
      const entryYear = new Date(`${entry.entryDate}T00:00:00Z`).getUTCFullYear();
      if (entryYear !== year) return false;
      if (query.season && normalizeSeason(entry.season ?? undefined) !== normalizeSeason(query.season)) return false;
      return true;
    });

    const monthly = buildMonthlyRows(filtered);
    const totalIncomeBdt = round2(monthly.reduce((sum, month) => sum + month.incomeBdt, 0));
    const totalExpenseBdt = round2(monthly.reduce((sum, month) => sum + month.expenseBdt, 0));
    const netProfitBdt = round2(totalIncomeBdt - totalExpenseBdt);
    const roiPct = totalExpenseBdt > 0 ? round2((netProfitBdt / totalExpenseBdt) * 100) : 0;
    const seasonSummaries = buildSeasonSummaries(filtered);
    const budgetBdt = context.plan ? nullableNumber(context.plan.farm_budget_bdt) : undefined;
    const expectedYieldKg = context.plan ? toNumber(context.plan.expected_yield) : undefined;
    const breakEvenYieldKg = context.plan ? toNumber(context.plan.break_even_yield) : undefined;
    const breakEvenPriceBdtPerKg =
      context.plan && nullableNumber(context.plan.break_even_price_bdt_per_kg) !== undefined
        ? nullableNumber(context.plan.break_even_price_bdt_per_kg)
        : expectedYieldKg && expectedYieldKg > 0
          ? round2(toNumber(context.plan!.total_cost_bdt) / expectedYieldKg)
          : undefined;

    trace.push(traceEvent("finance.aggregate_monthly", { year, season: query.season }, {
      totalIncomeBdt,
      totalExpenseBdt,
      netProfitBdt,
      roiPct,
      monthlyRows: monthly.length,
    }));

    const agentInsights = buildAgentInsights({
      monthly,
      totalIncomeBdt,
      totalExpenseBdt,
      netProfitBdt,
      roiPct,
      budgetBdt,
      expectedYieldKg,
      breakEvenYieldKg,
      breakEvenPriceBdtPerKg,
      crop: context.plan?.crop,
    });

    trace.push(traceEvent("finance.agent_advice", {
      deterministicInputs: ["monthly cash flow", "budget", "break-even", "ROI"],
    }, { insights: agentInsights }));

    return {
      query: { ...query, year },
      plan: context.plan
        ? {
            id: context.plan.id,
            farmId: context.plan.farm_id,
            crop: context.plan.crop,
            season: context.plan.target_season ?? undefined,
            expectedYieldKg,
            expectedRevenueBdt: toNumber(context.plan.expected_revenue_bdt),
            totalCostBdt: toNumber(context.plan.total_cost_bdt),
            netProfitBdt: toNumber(context.plan.net_profit_bdt),
            roiPct: toNumber(context.plan.roi_pct),
            breakEvenYieldKg,
            breakEvenPriceBdtPerKg,
          }
        : undefined,
      totals: {
        totalIncomeBdt,
        totalExpenseBdt,
        netProfitBdt,
        roiPct,
        budgetBdt,
        budgetSurplusBdt: budgetBdt === undefined ? undefined : round2(budgetBdt - totalExpenseBdt),
        breakEvenYieldKg,
        breakEvenPriceBdtPerKg,
      },
      monthly,
      seasons: seasonSummaries,
      entries: filtered.sort((a, b) => a.entryDate.localeCompare(b.entryDate)),
      agentInsights,
      context: hydratedContext,
      trace,
    };
  }

  async listEntries(query: FinanceSummaryQuery & { type?: FinanceEntryType } = {}): Promise<FinanceEntry[]> {
    const rows = await this.store.listManualEntries(query);
    return rows.map(normalizeManualEntry).filter((entry) => {
      if (!query.season) return true;
      return normalizeSeason(entry.season ?? undefined) === normalizeSeason(query.season);
    });
  }

  async createEntry(input: FinanceEntryInput): Promise<FinanceEntry> {
    validateEntryInput(input);
    return normalizeManualEntry(await this.store.createManualEntry(input));
  }

  async updateEntry(id: string, patch: Partial<FinanceEntryInput>): Promise<FinanceEntry | undefined> {
    if (!id) throw new Error("Entry id is required");
    if (patch.amountBdt !== undefined && patch.amountBdt < 0) throw new Error("Amount must be zero or more");
    const updated = await this.store.updateManualEntry(id, patch);
    return updated ? normalizeManualEntry(updated) : undefined;
  }

  async deleteEntry(id: string): Promise<boolean> {
    if (!id) throw new Error("Entry id is required");
    return this.store.deleteManualEntry(id);
  }
}

export class InMemoryFinanceStore implements FinanceDataStore {
  plan?: PlanRow;
  planItems: PlanItemRow[] = [];
  manualEntries: ManualEntryRow[] = [];
  payments: PaymentRow[] = [];
  orders: MarketplaceOrderRow[] = [];

  async loadProjectionContext(): Promise<{
    plan?: PlanRow;
    planItems: PlanItemRow[];
    manualEntries: ManualEntryRow[];
    payments: PaymentRow[];
    orders: MarketplaceOrderRow[];
  }> {
    return {
      plan: this.plan,
      planItems: [...this.planItems],
      manualEntries: [...this.manualEntries],
      payments: [...this.payments],
      orders: [...this.orders],
    };
  }

  async listManualEntries(): Promise<ManualEntryRow[]> {
    return [...this.manualEntries];
  }

  async createManualEntry(input: FinanceEntryInput): Promise<ManualEntryRow> {
    const now = new Date();
    const row: ManualEntryRow = {
      id: randomUUID(),
      farm_id: input.farmId ?? null,
      season_plan_id: input.seasonPlanId ?? null,
      entry_type: input.entryType,
      category: input.category,
      label: input.label,
      amount_bdt: input.amountBdt,
      entry_date: input.entryDate,
      season: input.season ?? null,
      crop: input.crop ?? null,
      source: "manual",
      metadata: input.metadata ?? {},
      created_at: now,
      updated_at: now,
    };
    this.manualEntries.push(row);
    return row;
  }

  async updateManualEntry(id: string, patch: Partial<FinanceEntryInput>): Promise<ManualEntryRow | undefined> {
    const index = this.manualEntries.findIndex((entry) => entry.id === id);
    if (index < 0) return undefined;
    const current = this.manualEntries[index]!;
    const updated: ManualEntryRow = {
      ...current,
      farm_id: patch.farmId ?? current.farm_id,
      season_plan_id: patch.seasonPlanId ?? current.season_plan_id,
      entry_type: patch.entryType ?? current.entry_type,
      category: patch.category ?? current.category,
      label: patch.label ?? current.label,
      amount_bdt: patch.amountBdt ?? current.amount_bdt,
      entry_date: patch.entryDate ?? current.entry_date,
      season: patch.season ?? current.season,
      crop: patch.crop ?? current.crop,
      metadata: patch.metadata ?? current.metadata,
      updated_at: new Date(),
    };
    this.manualEntries[index] = updated;
    return updated;
  }

  async deleteManualEntry(id: string): Promise<boolean> {
    const before = this.manualEntries.length;
    this.manualEntries = this.manualEntries.filter((entry) => entry.id !== id);
    return this.manualEntries.length < before;
  }
}

export class PostgresFinanceStore implements FinanceDataStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async loadProjectionContext(query: FinanceSummaryQuery): Promise<{
    plan?: PlanRow;
    planItems: PlanItemRow[];
    manualEntries: ManualEntryRow[];
    payments: PaymentRow[];
    orders: MarketplaceOrderRow[];
  }> {
    const plans = query.seasonPlanId
      ? await this.prisma.$queryRaw<PlanRow[]>`
          SELECT p.*, f."budget_bdt" AS farm_budget_bdt, f."target_season"
          FROM "season_plans" p
          JOIN "farm_profiles" f ON f."id" = p."farm_id"
          WHERE p."id" = ${query.seasonPlanId}::uuid
          LIMIT 1
        `
      : query.farmId
        ? await this.prisma.$queryRaw<PlanRow[]>`
            SELECT p.*, f."budget_bdt" AS farm_budget_bdt, f."target_season"
            FROM "season_plans" p
            JOIN "farm_profiles" f ON f."id" = p."farm_id"
            WHERE p."farm_id" = ${query.farmId}::uuid
            ORDER BY p."created_at" DESC
            LIMIT 1
          `
        : await this.prisma.$queryRaw<PlanRow[]>`
            SELECT p.*, f."budget_bdt" AS farm_budget_bdt, f."target_season"
            FROM "season_plans" p
            JOIN "farm_profiles" f ON f."id" = p."farm_id"
            ORDER BY p."created_at" DESC
            LIMIT 1
          `;
    const plan = plans[0];
    const farmId = query.farmId ?? plan?.farm_id;
    const planItems = plan
      ? await this.prisma.$queryRaw<PlanItemRow[]>`
          SELECT "id", "title", "item_type", "start_date", "total_cost_bdt"
          FROM "season_plan_items"
          WHERE "plan_id" = ${plan.id}::uuid
          ORDER BY "start_date" ASC NULLS LAST
        `
      : [];
    const manualEntries = await this.listManualEntries({ ...query, farmId, seasonPlanId: query.seasonPlanId ?? plan?.id });
    const payments = plan
      ? await this.prisma.$queryRaw<PaymentRow[]>`
          SELECT "id", "plan_id", "amount_bdt", "status", "created_at"
          FROM "bdapps_payments"
          WHERE "plan_id" = ${plan.id}::uuid AND "status" IN ('success', 'completed', 'simulated')
          ORDER BY "created_at" ASC
        `
      : [];
    const orders = farmId
      ? await this.prisma.$queryRaw<MarketplaceOrderRow[]>`
          SELECT o."id", o."farm_id", o."total_price_bdt", o."status", o."created_at", i."item_name"
          FROM "marketplace_orders" o
          LEFT JOIN "marketplace_supplier_items" i ON i."id" = o."supplier_item_id"
          WHERE o."farm_id" = ${farmId}::uuid
          ORDER BY o."created_at" ASC
        `
      : [];

    return { plan, planItems, manualEntries, payments, orders };
  }

  async listManualEntries(query: FinanceSummaryQuery & { type?: FinanceEntryType }): Promise<ManualEntryRow[]> {
    const year = query.year ?? new Date().getFullYear();
    if (query.farmId && query.seasonPlanId && query.type) {
      return this.prisma.$queryRaw<ManualEntryRow[]>`
        SELECT * FROM "farm_finance_entries"
        WHERE "source" = 'manual'
          AND "farm_id" = ${query.farmId}::uuid
          AND "season_plan_id" = ${query.seasonPlanId}::uuid
          AND "entry_type" = ${query.type}
          AND EXTRACT(YEAR FROM "entry_date") = ${year}
        ORDER BY "entry_date" ASC
      `;
    }
    if (query.farmId && query.type) {
      return this.prisma.$queryRaw<ManualEntryRow[]>`
        SELECT * FROM "farm_finance_entries"
        WHERE "source" = 'manual'
          AND "farm_id" = ${query.farmId}::uuid
          AND "entry_type" = ${query.type}
          AND EXTRACT(YEAR FROM "entry_date") = ${year}
        ORDER BY "entry_date" ASC
      `;
    }
    if (query.farmId) {
      return this.prisma.$queryRaw<ManualEntryRow[]>`
        SELECT * FROM "farm_finance_entries"
        WHERE "source" = 'manual'
          AND "farm_id" = ${query.farmId}::uuid
          AND EXTRACT(YEAR FROM "entry_date") = ${year}
        ORDER BY "entry_date" ASC
      `;
    }
    if (query.seasonPlanId) {
      return this.prisma.$queryRaw<ManualEntryRow[]>`
        SELECT * FROM "farm_finance_entries"
        WHERE "source" = 'manual'
          AND "season_plan_id" = ${query.seasonPlanId}::uuid
          AND EXTRACT(YEAR FROM "entry_date") = ${year}
        ORDER BY "entry_date" ASC
      `;
    }
    return this.prisma.$queryRaw<ManualEntryRow[]>`
      SELECT * FROM "farm_finance_entries"
      WHERE "source" = 'manual' AND EXTRACT(YEAR FROM "entry_date") = ${year}
      ORDER BY "entry_date" ASC
    `;
  }

  async createManualEntry(input: FinanceEntryInput): Promise<ManualEntryRow> {
    const rows = await this.prisma.$queryRaw<ManualEntryRow[]>`
      INSERT INTO "farm_finance_entries" (
        "id", "farm_id", "season_plan_id", "entry_type", "category", "label",
        "amount_bdt", "entry_date", "season", "crop", "source", "metadata"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${input.farmId ?? null}::uuid,
        ${input.seasonPlanId ?? null}::uuid,
        ${input.entryType},
        ${input.category},
        ${input.label},
        ${input.amountBdt},
        ${input.entryDate}::date,
        ${input.season ?? null},
        ${input.crop ?? null},
        'manual',
        ${JSON.stringify(input.metadata ?? {})}::jsonb
      )
      RETURNING *
    `;
    return rows[0]!;
  }

  async updateManualEntry(id: string, patch: Partial<FinanceEntryInput>): Promise<ManualEntryRow | undefined> {
    const current = (await this.prisma.$queryRaw<ManualEntryRow[]>`
      SELECT * FROM "farm_finance_entries" WHERE "id" = ${id}::uuid AND "source" = 'manual' LIMIT 1
    `)[0];
    if (!current) return undefined;
    const next: FinanceEntryInput = {
      farmId: patch.farmId ?? current.farm_id ?? undefined,
      seasonPlanId: patch.seasonPlanId ?? current.season_plan_id ?? undefined,
      entryType: patch.entryType ?? current.entry_type,
      category: patch.category ?? current.category,
      label: patch.label ?? current.label,
      amountBdt: patch.amountBdt ?? toNumber(current.amount_bdt),
      entryDate: patch.entryDate ?? dateOnly(current.entry_date),
      season: patch.season ?? current.season ?? undefined,
      crop: patch.crop ?? current.crop ?? undefined,
      metadata: asMetadata(patch.metadata ?? current.metadata ?? {}),
    };
    validateEntryInput(next);
    const rows = await this.prisma.$queryRaw<ManualEntryRow[]>`
      UPDATE "farm_finance_entries"
      SET
        "farm_id" = ${next.farmId ?? null}::uuid,
        "season_plan_id" = ${next.seasonPlanId ?? null}::uuid,
        "entry_type" = ${next.entryType},
        "category" = ${next.category},
        "label" = ${next.label},
        "amount_bdt" = ${next.amountBdt},
        "entry_date" = ${next.entryDate}::date,
        "season" = ${next.season ?? null},
        "crop" = ${next.crop ?? null},
        "metadata" = ${JSON.stringify(next.metadata ?? {})}::jsonb,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}::uuid AND "source" = 'manual'
      RETURNING *
    `;
    return rows[0];
  }

  async deleteManualEntry(id: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      DELETE FROM "farm_finance_entries"
      WHERE "id" = ${id}::uuid AND "source" = 'manual'
      RETURNING "id"
    `;
    return rows.length > 0;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

function entriesFromPlan(plan: PlanRow | undefined, items: PlanItemRow[]): FinanceEntry[] {
  if (!plan) return [];
  const season = plan.target_season ?? seasonFromDate(dateOnly(plan.created_at));
  const itemEntries: FinanceEntry[] = items
    .filter((item) => toNumber(item.total_cost_bdt) > 0)
    .map((item) => ({
      id: `plan-item:${item.id}`,
      farmId: plan.farm_id,
      seasonPlanId: plan.id,
      entryType: "expense" as const,
      category: item.item_type,
      label: item.title,
      amountBdt: toNumber(item.total_cost_bdt),
      entryDate: item.start_date ? dateOnly(item.start_date) : dateOnly(plan.created_at),
      season,
      crop: plan.crop,
      source: "season_plan" as const,
      metadata: { derivedFrom: "season_plan_items" },
      editable: false,
    }));
  const scheduledCost = itemEntries.reduce((sum, entry) => sum + entry.amountBdt, 0);
  const unscheduledCost = round2(Math.max(0, toNumber(plan.total_cost_bdt) - scheduledCost));
  const expenseEntries = unscheduledCost > 0
    ? [
        ...itemEntries,
        {
          id: `plan-cost:${plan.id}`,
          farmId: plan.farm_id,
          seasonPlanId: plan.id,
          entryType: "expense" as const,
          category: "planned_inputs",
          label: "Unscheduled planned inputs",
          amountBdt: unscheduledCost,
          entryDate: dateOnly(plan.created_at),
          season,
          crop: plan.crop,
          source: "season_plan" as const,
          metadata: { derivedFrom: "season_plan.total_cost_bdt" },
          editable: false,
        },
      ]
    : itemEntries;

  return [
    ...expenseEntries,
    {
      id: `plan-income:${plan.id}`,
      farmId: plan.farm_id,
      seasonPlanId: plan.id,
      entryType: "income",
      category: "harvest_revenue",
      label: `${titleCase(plan.crop)} projected harvest revenue`,
      amountBdt: toNumber(plan.expected_revenue_bdt),
      entryDate: harvestDateFromItems(items, plan.created_at),
      season,
      crop: plan.crop,
      source: "season_plan" as const,
      metadata: { derivedFrom: "season_plan.expected_revenue_bdt" },
      editable: false,
    },
  ];
}

function normalizeManualEntry(row: ManualEntryRow): FinanceEntry {
  return {
    id: row.id,
    farmId: row.farm_id ?? undefined,
    seasonPlanId: row.season_plan_id ?? undefined,
    entryType: row.entry_type,
    category: row.category,
    label: row.label,
    amountBdt: toNumber(row.amount_bdt),
    entryDate: dateOnly(row.entry_date),
    season: row.season ?? undefined,
    crop: row.crop ?? undefined,
    source: normalizeSource(row.source),
    metadata: asMetadata(row.metadata),
    editable: row.source === "manual",
  };
}

function entryFromPayment(row: PaymentRow, plan?: PlanRow): FinanceEntry {
  return {
    id: `payment:${row.id}`,
    farmId: plan?.farm_id,
    seasonPlanId: row.plan_id ?? undefined,
    entryType: "expense",
    category: "bdapps_payment",
    label: "bdapps advisory payment",
    amountBdt: toNumber(row.amount_bdt),
    entryDate: dateOnly(row.created_at),
    season: plan?.target_season ?? seasonFromDate(dateOnly(row.created_at)),
    crop: plan?.crop,
    source: "payment" as const,
    metadata: { status: row.status },
    editable: false,
  };
}

function entryFromOrder(row: MarketplaceOrderRow, plan?: PlanRow): FinanceEntry {
  return {
    id: `marketplace:${row.id}`,
    farmId: row.farm_id ?? undefined,
    seasonPlanId: plan?.id,
    entryType: "expense",
    category: "marketplace_order",
    label: row.item_name ? `Marketplace: ${row.item_name}` : "Marketplace order",
    amountBdt: toNumber(row.total_price_bdt),
    entryDate: dateOnly(row.created_at),
    season: plan?.target_season ?? seasonFromDate(dateOnly(row.created_at)),
    crop: plan?.crop,
    source: "marketplace" as const,
    metadata: { status: row.status },
    editable: false,
  };
}

function buildMonthlyRows(entries: FinanceEntry[]): FinanceMonthlyRow[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthEntries = entries.filter((entry) => Number(entry.entryDate.slice(5, 7)) === month);
    const incomeEntries = monthEntries.filter((entry) => entry.entryType === "income");
    const expenseEntries = monthEntries.filter((entry) => entry.entryType === "expense");
    const incomeBdt = round2(incomeEntries.reduce((sum, entry) => sum + entry.amountBdt, 0));
    const expenseBdt = round2(expenseEntries.reduce((sum, entry) => sum + entry.amountBdt, 0));
    const projectedIncomeBdt = round2(incomeEntries.filter((entry) => entry.source === "season_plan").reduce((sum, entry) => sum + entry.amountBdt, 0));
    const projectedExpenseBdt = round2(expenseEntries.filter((entry) => entry.source === "season_plan").reduce((sum, entry) => sum + entry.amountBdt, 0));
    const actualIncomeBdt = round2(incomeEntries.filter((entry) => entry.source !== "season_plan").reduce((sum, entry) => sum + entry.amountBdt, 0));
    const actualExpenseBdt = round2(expenseEntries.filter((entry) => entry.source !== "season_plan").reduce((sum, entry) => sum + entry.amountBdt, 0));
    const hasProjected = projectedIncomeBdt + projectedExpenseBdt > 0;
    const hasActual = actualIncomeBdt + actualExpenseBdt > 0;
    return {
      month,
      label: new Date(Date.UTC(2026, index, 1)).toLocaleString("en", { month: "short" }),
      season: seasonFromMonth(month),
      incomeBdt,
      expenseBdt,
      profitBdt: round2(incomeBdt - expenseBdt),
      projectedIncomeBdt,
      projectedExpenseBdt,
      actualIncomeBdt,
      actualExpenseBdt,
      status: hasProjected && hasActual ? "mixed" : hasProjected ? "projected" : hasActual ? "actual" : "empty",
      drivers: monthEntries.slice(0, 4).map((entry) => entry.label),
      entryCount: monthEntries.length,
    };
  });
}

function buildSeasonSummaries(entries: FinanceEntry[]): FinanceSeasonSummary[] {
  const seasons = new Map<string, FinanceSeasonSummary>();
  for (const entry of entries) {
    const season = entry.season ?? seasonFromDate(entry.entryDate);
    const current = seasons.get(season) ?? { season, incomeBdt: 0, expenseBdt: 0, profitBdt: 0, entryCount: 0 };
    if (entry.entryType === "income") current.incomeBdt += entry.amountBdt;
    else current.expenseBdt += entry.amountBdt;
    current.profitBdt = current.incomeBdt - current.expenseBdt;
    current.entryCount += 1;
    seasons.set(season, current);
  }
  return [...seasons.values()].map((season) => ({
    ...season,
    incomeBdt: round2(season.incomeBdt),
    expenseBdt: round2(season.expenseBdt),
    profitBdt: round2(season.profitBdt),
  }));
}

function buildAgentInsights(input: {
  monthly: FinanceMonthlyRow[];
  totalIncomeBdt: number;
  totalExpenseBdt: number;
  netProfitBdt: number;
  roiPct: number;
  budgetBdt?: number;
  expectedYieldKg?: number;
  breakEvenYieldKg?: number;
  breakEvenPriceBdtPerKg?: number;
  crop?: string;
}): FinanceAgentInsight[] {
  const insights: FinanceAgentInsight[] = [];
  if (input.budgetBdt !== undefined && input.totalExpenseBdt > input.budgetBdt) {
    insights.push({
      severity: "warning",
      title: "Budget overrun risk",
      message: `Projected expenses exceed the farm budget by BDT ${formatBdt(input.totalExpenseBdt - input.budgetBdt)}.`,
      action: "Reduce discretionary inputs or split large purchases before sowing.",
    });
  }
  const expensiveMonths = input.monthly.filter((month) => month.expenseBdt > 0).sort((a, b) => b.expenseBdt - a.expenseBdt);
  if (expensiveMonths[0]) {
    insights.push({
      severity: "info",
      title: "Highest cash-out month",
      message: `${expensiveMonths[0].label} has the largest expected expense at BDT ${formatBdt(expensiveMonths[0].expenseBdt)}.`,
      action: "Keep that amount available before fertilizer, irrigation, and labor tasks start.",
    });
  }
  if (input.expectedYieldKg && input.breakEvenYieldKg) {
    const yieldBufferPct = ((input.expectedYieldKg - input.breakEvenYieldKg) / input.expectedYieldKg) * 100;
    insights.push({
      severity: yieldBufferPct < 20 ? "warning" : "success",
      title: "Break-even yield buffer",
      message: `${titleCase(input.crop ?? "crop")} can break even at ${Math.round(input.breakEvenYieldKg)} kg, leaving a ${round2(yieldBufferPct)}% yield buffer.`,
      action: yieldBufferPct < 20 ? "Protect yield with tighter pest and irrigation checks." : "Current yield buffer is acceptable for the plan.",
    });
  }
  insights.push({
    severity: input.netProfitBdt >= 0 ? "success" : "warning",
    title: "Season profit outlook",
    message: `Projected net profit is BDT ${formatBdt(input.netProfitBdt)} with ROI ${input.roiPct}%.`,
    action: input.netProfitBdt >= 0 ? "Track actual ledger entries against this baseline weekly." : "Re-run crop ranking or lower input costs before committing.",
  });
  return insights;
}

function validateEntryInput(input: FinanceEntryInput): void {
  if (!["income", "expense"].includes(input.entryType)) throw new Error("entryType must be income or expense");
  if (!input.category?.trim()) throw new Error("Category is required");
  if (!input.label?.trim()) throw new Error("Label is required");
  if (!Number.isFinite(input.amountBdt) || input.amountBdt < 0) throw new Error("Amount must be zero or more");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.entryDate)) throw new Error("entryDate must be YYYY-MM-DD");
}

function traceEvent(toolName: string, parameters: Record<string, unknown>, rawResponse: unknown): IntakeTraceEvent {
  return {
    traceId: randomUUID(),
    kind: "tool",
    toolName,
    parameters,
    rawResponse,
    status: "success",
    latencyMs: 0,
  };
}

function harvestDateFromItems(items: PlanItemRow[], fallback: Date | string): string {
  const harvest = items
    .filter((item) => item.item_type.toLowerCase().includes("harvest") || item.title.toLowerCase().includes("harvest"))
    .map((item) => item.start_date)
    .filter(Boolean)
    .sort()
    .at(-1);
  return harvest ? dateOnly(harvest) : dateOnly(fallback);
}

function seasonFromMonth(month: number): string {
  if ([12, 1, 2].includes(month)) return "rabi";
  if ([6, 7, 8, 9, 10].includes(month)) return "monsoon";
  return "kharif";
}

function seasonFromDate(date: string): string {
  return seasonFromMonth(Number(date.slice(5, 7)));
}

function normalizeSeason(season: string | undefined): string {
  return (season ?? "").trim().toLowerCase();
}

function dateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return round2(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return round2(Number(value));
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return round2(value.toNumber());
  }
  return round2(Number(value ?? 0));
}

function nullableNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const number = toNumber(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeSource(source: string): FinanceEntrySource {
  if (source === "manual" || source === "season_plan" || source === "payment" || source === "marketplace" || source === "agent") {
    return source;
  }
  return "manual";
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatBdt(value: number): string {
  return Math.round(Math.abs(value)).toLocaleString("en-BD");
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

let defaultFinanceStore: FinanceDataStore | undefined;

export function getDefaultFinanceStore(): FinanceDataStore {
  defaultFinanceStore ??= config.databaseUrl ? new PostgresFinanceStore(config.databaseUrl) : new InMemoryFinanceStore();
  return defaultFinanceStore;
}

export const financeService = new FinanceService();
