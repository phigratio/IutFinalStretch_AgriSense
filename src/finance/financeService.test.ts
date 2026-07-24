import { describe, expect, it } from "vitest";
import { FinanceService, InMemoryFinanceStore } from "./financeService.js";

function buildStore() {
  const store = new InMemoryFinanceStore();
  store.plan = {
    id: "plan-1",
    farm_id: "farm-1",
    crop: "rice",
    expected_yield: 2400,
    expected_revenue_bdt: 72000,
    total_cost_bdt: 38000,
    net_profit_bdt: 34000,
    roi_pct: 89.47,
    break_even_yield: 1266.67,
    break_even_price_bdt_per_kg: 15.83,
    created_at: "2026-07-01",
    farm_budget_bdt: 45000,
    target_season: "monsoon",
  };
  store.planItems = [
    {
      id: "item-1",
      title: "Land preparation",
      item_type: "land_preparation",
      start_date: "2026-07-05",
      total_cost_bdt: 8000,
    },
    {
      id: "item-2",
      title: "Fertilizer top dress",
      item_type: "fertilizer",
      start_date: "2026-08-12",
      total_cost_bdt: 9000,
    },
    {
      id: "item-3",
      title: "Harvest",
      item_type: "harvest",
      start_date: "2026-11-15",
      total_cost_bdt: 6000,
    },
  ];
  return store;
}

describe("FinanceService", () => {
  it("builds a yearly projection from plan items and harvest revenue", async () => {
    const service = new FinanceService(buildStore());

    const summary = await service.getSummary({ year: 2026 });

    expect(summary.monthly).toHaveLength(12);
    expect(summary.totals.totalIncomeBdt).toBe(72000);
    expect(summary.totals.totalExpenseBdt).toBe(38000);
    expect(summary.totals.netProfitBdt).toBe(34000);
    expect(summary.totals.breakEvenPriceBdtPerKg).toBe(15.83);
    expect(summary.entries.some((entry) => entry.label === "Unscheduled planned inputs")).toBe(true);
    expect(summary.trace.map((event) => event.toolName)).toEqual(
      expect.arrayContaining(["finance.load_sources", "finance.aggregate_monthly", "finance.agent_advice"]),
    );
  });

  it("manual ledger entries update totals deterministically", async () => {
    const store = buildStore();
    const service = new FinanceService(store);
    const entry = await service.createEntry({
      farmId: "farm-1",
      seasonPlanId: "plan-1",
      entryType: "expense",
      category: "labor",
      label: "Extra transplanting labor",
      amountBdt: 2500,
      entryDate: "2026-07-18",
      season: "monsoon",
      crop: "rice",
    });

    let summary = await service.getSummary({ year: 2026, season: "monsoon" });
    expect(summary.totals.totalExpenseBdt).toBe(40500);
    expect(summary.totals.netProfitBdt).toBe(31500);

    await service.updateEntry(entry.id, { amountBdt: 1500 });
    summary = await service.getSummary({ year: 2026, season: "monsoon" });
    expect(summary.totals.totalExpenseBdt).toBe(39500);

    await service.deleteEntry(entry.id);
    summary = await service.getSummary({ year: 2026, season: "monsoon" });
    expect(summary.totals.totalExpenseBdt).toBe(38000);
  });

  it("returns actionable finance-agent insights", async () => {
    const service = new FinanceService(buildStore());

    const summary = await service.getSummary({ year: 2026 });

    expect(summary.agentInsights.length).toBeGreaterThanOrEqual(3);
    expect(summary.agentInsights.map((insight) => insight.title)).toContain("Season profit outlook");
  });
});
