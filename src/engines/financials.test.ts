import { describe, it, expect } from "vitest";
import {
  computeFinancials,
  normalizePricePerKg,
  type FinancialInput,
} from "./financials.js";

/** Golden farm: 1 ha T. Aman, hand-checked below. */
const goldenFarm = (areaHa: number): FinancialInput => ({
  cropId: "rice_t_aman",
  areaHa,
  yieldTPerHa: 4.5,
  priceBdtPerKg: 48,
  fertDosePerHa: { urea: 180, tsp: 70, mop: 70, gypsum: 60, zinc: 8 },
  // DEFAULT_INPUT_PRICES: urea 27, tsp 27, mop 20, gypsum 12, zinc 220
  seedCostPerHa: 1500,
  landPrepPerHa: 6000,
  pesticidePerHa: 2000,
  harvestPerHa: 4000,
  transportPerHa: 1500,
  otherPerHa: 1000,
  irrigation: { count: 2, costPerIrrigationPerHa: 1200 },
  labor: { daysPerHa: 30, ratePerDay: 500 },
});

describe("normalizePricePerKg (G1)", () => {
  it("maund -> per kg", () => {
    expect(normalizePricePerKg(1500, "maund")).toBeCloseTo(40.188, 2);
  });
  it("kg passthrough, quintal, ton", () => {
    expect(normalizePricePerKg(50, "kg")).toBe(50);
    expect(normalizePricePerKg(5000, "quintal")).toBe(50);
    expect(normalizePricePerKg(50000, "ton")).toBe(50);
  });
});

describe("computeFinancials golden farm (G3)", () => {
  const r = computeFinancials(goldenFarm(1));

  it("itemizes costs correctly", () => {
    expect(r.costs.urea).toBe(4860); // 180 * 27
    expect(r.costs.zinc).toBe(1760); // 8 * 220
    expect(r.costs.labor).toBe(15000); // 30 * 500
    expect(r.costs.irrigation).toBe(2400); // 2 * 1200
  });

  it("hits the hand-checked totals", () => {
    expect(r.totalCostBdt).toBeCloseTo(44030, 2);
    expect(r.expectedYieldKg).toBe(4500);
    expect(r.grossRevenueBdt).toBe(216000);
    expect(r.netProfitBdt).toBeCloseTo(171970, 2);
    expect(r.roiPercent).toBeCloseTo(390.57, 2);
    expect(r.breakEvenPriceBdtPerKg).toBeCloseTo(9.784, 3);
    expect(r.breakEvenYieldKg).toBeCloseTo(917.29, 2);
  });
});

describe("area scaling invariants (G3)", () => {
  const one = computeFinancials(goldenFarm(1));
  const two = computeFinancials(goldenFarm(2));

  it("doubling area doubles cost, yield, revenue, profit", () => {
    expect(two.totalCostBdt).toBeCloseTo(one.totalCostBdt * 2, 2);
    expect(two.expectedYieldKg).toBeCloseTo(one.expectedYieldKg * 2, 2);
    expect(two.grossRevenueBdt).toBeCloseTo(one.grossRevenueBdt * 2, 2);
    expect(two.netProfitBdt).toBeCloseTo(one.netProfitBdt * 2, 2);
  });

  it("per-ha figures and ROI stay constant", () => {
    expect(two.roiPercent).toBeCloseTo(one.roiPercent, 6);
    expect(two.breakEvenPriceBdtPerKg).toBeCloseTo(one.breakEvenPriceBdtPerKg, 6);
    expect(two.totalCostBdt / 2).toBeCloseTo(one.totalCostBdt, 2);
    expect(two.netProfitBdt / 2).toBeCloseTo(one.netProfitBdt, 2);
  });
});
