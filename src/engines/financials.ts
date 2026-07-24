/**
 * Finance engine (T0-5). One pure function — no LLM arithmetic, no I/O. All inputs are
 * per-hectare rates plus `areaHa`; the function scales by area so that doubling area doubles
 * cost, yield, revenue, and profit while per-ha figures and ROI stay constant (the invariant the
 * golden-farm test checks).
 */

export type PriceUnit = "kg" | "maund" | "quintal" | "ton";

/** BD maund = 40 seer ≈ 37.3242 kg. Normalize every price to BDT/kg at load (spec §5). */
export function normalizePricePerKg(price: number, unit: PriceUnit): number {
  const perKg: Record<PriceUnit, number> = {
    kg: price,
    maund: price / 37.3242,
    quintal: price / 100,
    ton: price / 1000,
  };
  return perKg[unit];
}

/** Linear dose scaling: kg/ha × ha. Extracted so it can be unit-tested on its own (G2). */
export function scaleDose(dosePerHa: number, areaHa: number): number {
  return dosePerHa * areaHa;
}

export interface FertDosePerHa {
  urea: number;
  tsp: number;
  mop: number;
  gypsum: number;
  zinc: number;
}

/** BDT per kg of each fertilizer. Baseline placeholders (manual/unverified) — override at call site. */
export const DEFAULT_INPUT_PRICES: FertDosePerHa = {
  urea: 27,
  tsp: 27,
  mop: 20,
  gypsum: 12,
  zinc: 220,
};

export interface FinancialInput {
  cropId: string;
  areaHa: number;
  yieldTPerHa: number;
  priceBdtPerKg: number;
  fertDosePerHa: FertDosePerHa;
  /** BDT/kg for each fertilizer product. */
  inputPrices?: FertDosePerHa;
  /** Per-hectare operational costs, BDT/ha. */
  seedCostPerHa?: number;
  landPrepPerHa?: number;
  pesticidePerHa?: number;
  harvestPerHa?: number;
  transportPerHa?: number;
  otherPerHa?: number;
  machineryCostPerHa?: number;
  irrigation?: { count: number; costPerIrrigationPerHa: number };
  labor?: { daysPerHa: number; ratePerDay: number };
}

export interface FinancialCosts {
  seed: number;
  urea: number;
  tsp: number;
  mop: number;
  gypsum: number;
  zinc: number;
  landPrep: number;
  irrigation: number;
  labor: number;
  pesticide: number;
  harvest: number;
  transport: number;
  other: number;
}

export interface FinancialResult {
  costs: FinancialCosts;
  totalCostBdt: number;
  expectedYieldKg: number;
  grossRevenueBdt: number;
  netProfitBdt: number;
  roiPercent: number;
  breakEvenPriceBdtPerKg: number;
  breakEvenYieldKg: number;
}

export function computeFinancials(input: FinancialInput): FinancialResult {
  const {
    areaHa,
    yieldTPerHa,
    priceBdtPerKg,
    fertDosePerHa,
    inputPrices = DEFAULT_INPUT_PRICES,
    seedCostPerHa = 0,
    landPrepPerHa = 0,
    pesticidePerHa = 0,
    harvestPerHa = 0,
    transportPerHa = 0,
    otherPerHa = 0,
    machineryCostPerHa = 0,
    irrigation = { count: 0, costPerIrrigationPerHa: 0 },
    labor = { daysPerHa: 0, ratePerDay: 0 },
  } = input;

  const costs: FinancialCosts = {
    seed: seedCostPerHa * areaHa,
    urea: scaleDose(fertDosePerHa.urea, areaHa) * inputPrices.urea,
    tsp: scaleDose(fertDosePerHa.tsp, areaHa) * inputPrices.tsp,
    mop: scaleDose(fertDosePerHa.mop, areaHa) * inputPrices.mop,
    gypsum: scaleDose(fertDosePerHa.gypsum, areaHa) * inputPrices.gypsum,
    zinc: scaleDose(fertDosePerHa.zinc, areaHa) * inputPrices.zinc,
    landPrep: landPrepPerHa * areaHa,
    irrigation: irrigation.count * irrigation.costPerIrrigationPerHa * areaHa,
    labor: labor.daysPerHa * labor.ratePerDay * areaHa,
    pesticide: pesticidePerHa * areaHa,
    harvest: harvestPerHa * areaHa,
    transport: transportPerHa * areaHa,
    other: (otherPerHa + machineryCostPerHa) * areaHa,
  };

  const totalCostBdt = Object.values(costs).reduce((a, b) => a + b, 0);
  const expectedYieldKg = yieldTPerHa * 1000 * areaHa;
  const grossRevenueBdt = expectedYieldKg * priceBdtPerKg;
  const netProfitBdt = grossRevenueBdt - totalCostBdt;

  return {
    costs,
    totalCostBdt,
    expectedYieldKg,
    grossRevenueBdt,
    netProfitBdt,
    roiPercent: totalCostBdt > 0 ? (netProfitBdt / totalCostBdt) * 100 : 0,
    breakEvenPriceBdtPerKg: expectedYieldKg > 0 ? totalCostBdt / expectedYieldKg : 0,
    breakEvenYieldKg: priceBdtPerKg > 0 ? totalCostBdt / priceBdtPerKg : 0,
  };
}
