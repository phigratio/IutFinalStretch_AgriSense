import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { FinanceService, InMemoryFinanceStore } from "../finance/financeService.js";
import { createFinanceRouter } from "./finance.js";

function makeApp() {
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
  const app = express();
  app.use(express.json());
  app.use("/api/finance", createFinanceRouter(new FinanceService(store)));
  return app;
}

describe("/api/finance", () => {
  it("returns summary, advice, and inspectable entries", async () => {
    const app = makeApp();
    const summary = await request(app).get("/api/finance/summary?year=2026");

    expect(summary.status).toBe(200);
    expect(summary.body.monthly).toHaveLength(12);
    expect(summary.body.totals.totalIncomeBdt).toBe(72000);
    expect(summary.body.agentInsights.length).toBeGreaterThan(0);
    expect(summary.body.trace.some((event: { toolName: string }) => event.toolName === "finance.agent_advice")).toBe(true);

    const advice = await request(app).post("/api/finance/advice").send({ year: 2026 });
    expect(advice.status).toBe(200);
    expect(advice.body.agentInsights.length).toBeGreaterThan(0);
  });

  it("creates, updates, lists, and deletes manual ledger entries", async () => {
    const app = makeApp();
    const created = await request(app)
      .post("/api/finance/entries")
      .send({
        farmId: "farm-1",
        seasonPlanId: "plan-1",
        entryType: "expense",
        category: "labor",
        label: "Extra labor",
        amountBdt: 900,
        entryDate: "2026-07-20",
        season: "monsoon",
        crop: "rice",
      });
    expect(created.status).toBe(201);
    expect(created.body.editable).toBe(true);

    const updated = await request(app).patch(`/api/finance/entries/${created.body.id}`).send({ amountBdt: 1200 });
    expect(updated.status).toBe(200);
    expect(updated.body.amountBdt).toBe(1200);

    const listed = await request(app).get("/api/finance/entries?year=2026&type=expense");
    expect(listed.status).toBe(200);
    expect(listed.body.some((entry: { id: string }) => entry.id === created.body.id)).toBe(true);

    const deleted = await request(app).delete(`/api/finance/entries/${created.body.id}`);
    expect(deleted.status).toBe(204);
  });
});
