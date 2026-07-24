/**
 * Orchestrator (F1). Runs the deterministic Tier 0 pipeline once intake is complete: ground →
 * rank → choose → plan → financials → basis. Every grounding/engine step is wrapped in the trace
 * so every number in the output maps to a trace stepId (the G5 invariant). Weather, forecast, and
 * normals fetchers are injected so this is testable without a network or DB.
 */

import { rankCrops, type RankedCrop, type RankProfile, type WaterAvailability } from "./ranking.js";
import { generateSeasonPlan, type SeasonPlanResult } from "./seasonPlan.js";
import { computeFinancials, normalizePricePerKg, type FinancialResult, type PriceUnit } from "../engines/financials.js";
import { buildRecommendationBasis } from "./basis.js";
import { runTraced, type TraceWriter, type TraceEvent } from "../tools/trace.js";
import { CROP_IDS, type CropId, isCropId } from "../data/crops.js";
import {
  getVarietyForCrop,
  getFertilizer,
  getPrice,
  loadTable,
  type FertilityClass,
  type SoilTexture,
} from "../data/loader.js";
import type { ForecastResult, NormalsResult } from "../tools/weather.js";
import type { IntakeState } from "./intake.js";
import type { Season } from "./normalize.js";

export interface OrchestratorProfile extends IntakeState {
  district: string;
  areaHa: number;
  soilTexture: SoilTexture;
  waterAvailability: WaterAvailability;
  budgetBdt: number;
  targetSeason: Season;
  fertilityClass: FertilityClass;
}

export interface ResolvedCropPrice {
  pricePerKg: number;
  provenance?: unknown;
}

export interface OrchestratorDeps {
  writer: TraceWriter;
  getForecast: () => Promise<ForecastResult>;
  getNormals: (months: number[]) => Promise<NormalsResult>;
  /** Optional pre-chosen crop; otherwise the top-ranked crop is the recommendation. */
  chosenCropId?: string;
  /** Optional KB price resolver; when absent, prices come from the CSV baseline. */
  resolvePrice?: (cropId: string) => Promise<ResolvedCropPrice | null>;
}

export interface NumberProvenance {
  label: string;
  value: number;
  stepId: string;
}

export interface OrchestratorResult {
  ranking: RankedCrop[];
  chosen: { cropId: CropId; recommended: boolean };
  plan: SeasonPlanResult;
  financials: FinancialResult;
  basis: string;
  numbers: NumberProvenance[];
  weatherAvailable: boolean;
  trace: TraceEvent[];
}

const SEASON_MONTHS: Record<Season, number[]> = {
  kharif1: [3, 4, 5, 6],
  kharif2_aman: [7, 8, 9, 10, 11],
  rabi: [11, 12, 1, 2, 3],
  boro: [12, 1, 2, 3, 4, 5],
};

const IRRIGATION_EVENTS: Record<WaterAvailability, number> = {
  rainfed: 0,
  limited_irrigation: 2,
  reliable_irrigation: 4,
};

export async function runPipeline(
  profile: OrchestratorProfile,
  deps: OrchestratorDeps,
): Promise<OrchestratorResult> {
  const { writer } = deps;
  const numbers: NumberProvenance[] = [];

  // --- Step 3a: forecast (may fail; failure is traced, never invented) ---
  let forecast: ForecastResult | null = null;
  let forecastStep = "";
  try {
    const t = await runTraced(writer, {
      toolName: "get_forecast",
      purpose: "crop_ranking.weatherFit,basis.weather",
      parameters: { lat: profile.lat, lon: profile.lon },
    }, () => deps.getForecast());
    forecast = t.result;
    forecastStep = t.event.stepId;
    numbers.push({ label: "totalRainNext7Mm", value: forecast.totalRainNext7Mm, stepId: forecastStep });
    numbers.push({ label: "tmeanNext7C", value: forecast.tmeanNext7C, stepId: forecastStep });
  } catch {
    // Weather down: continue on normals only. The error event is already in the trace.
    forecast = null;
  }

  // --- Step 3b: climate normals ---
  const months = SEASON_MONTHS[profile.targetSeason];
  const normalsT = await runTraced(writer, {
    toolName: "get_climate_normals",
    purpose: "crop_ranking.waterFit,basis.normals",
    parameters: { lat: profile.lat, lon: profile.lon, months },
  }, () => deps.getNormals(months));
  const normals = normalsT.result;
  const seasonRainMm = normals.monthly.reduce((a, m) => a + m.avgRainMm, 0);
  numbers.push({ label: "seasonRainMm", value: Math.round(seasonRainMm), stepId: normalsT.event.stepId });

  // --- Step 3c: resolve KB prices (tenant-over-hub) for all candidate crops ---
  const priceMap = new Map<string, ResolvedCropPrice>();
  let priceStep = "";
  if (deps.resolvePrice) {
    const pT = await runTraced(writer, {
      toolName: "resolve_prices",
      purpose: "crop_ranking.profitPotential,financials",
      parameters: { crops: [...CROP_IDS], district: profile.district },
    }, async () => {
      const out: Record<string, ResolvedCropPrice> = {};
      for (const cropId of CROP_IDS) {
        const r = await deps.resolvePrice!(cropId);
        if (r) out[cropId] = r;
      }
      return out;
    });
    for (const [k, v] of Object.entries(pT.result)) priceMap.set(k, v);
    priceStep = pT.event.stepId;
  }
  const priceLookup = (cropId: string): { pricePerKg: number } | null => {
    const r = priceMap.get(cropId);
    return r ? { pricePerKg: r.pricePerKg } : null;
  };

  // --- Step 4: rank (deterministic) ---
  const rankProfile: RankProfile = {
    areaHa: profile.areaHa,
    soilTexture: profile.soilTexture,
    fertilityClass: profile.fertilityClass,
    waterAvailability: profile.waterAvailability,
    budgetBdt: profile.budgetBdt,
    targetSeason: profile.targetSeason,
  };
  const rankingT = await runTraced(writer, {
    toolName: "rank_crops",
    purpose: "recommendation",
    parameters: rankProfile,
  }, () =>
    rankCrops(
      rankProfile,
      { totalRainNext7Mm: forecast?.totalRainNext7Mm, tmeanNext7C: forecast?.tmeanNext7C },
      { seasonRainMm },
      [...CROP_IDS],
      priceLookup,
    ),
  );
  const ranking = rankingT.result;

  // --- Step 5: choose (farmer pick, else top-ranked recommendation) ---
  const honoredPick =
    !!deps.chosenCropId &&
    isCropId(deps.chosenCropId) &&
    ranking.some((r) => r.cropId === deps.chosenCropId);
  const picked = honoredPick ? (deps.chosenCropId as CropId) : ranking[0].cropId;
  // recommended = we chose it (no valid farmer pick honored)
  const chosen = { cropId: picked, recommended: !honoredPick };
  const chosenRank = ranking.find((r) => r.cropId === picked)!;
  numbers.push({ label: "suitabilityScore", value: chosenRank.score, stepId: rankingT.event.stepId });

  // --- Step 6: season plan ---
  const planT = await runTraced(writer, {
    toolName: "build_season_plan",
    purpose: "plan",
    parameters: { cropId: picked, areaHa: profile.areaHa },
  }, () =>
    generateSeasonPlan({
      cropId: picked,
      areaHa: profile.areaHa,
      fertilityClass: profile.fertilityClass,
      waterAvailability: profile.waterAvailability,
      forecast: forecast ? { daily: forecast.daily.map((d) => ({ date: d.date, rainMm: d.rainMm })) } : undefined,
    }),
  );
  const plan = planT.result;

  // --- Step 7: financials (pure) ---
  const variety = getVarietyForCrop(picked);
  const fert = getFertilizer(picked, profile.fertilityClass);
  // Prefer the resolved KB price; fall back to the CSV baseline for crops WFP doesn't cover.
  const kbPrice = priceMap.get(picked);
  const priceRow = getPrice(picked);
  const priceBdtPerKg = kbPrice
    ? kbPrice.pricePerKg
    : priceRow
      ? normalizePricePerKg(priceRow.price, (priceRow.unit as PriceUnit) ?? "kg")
      : 0;
  if (kbPrice && priceStep) {
    numbers.push({ label: "priceBdtPerKg", value: round2(priceBdtPerKg), stepId: priceStep });
  }
  const events = IRRIGATION_EVENTS[profile.waterAvailability];

  const finT = await runTraced(writer, {
    toolName: "compute_financials",
    purpose: "financials,basis.economics",
    parameters: { cropId: picked, areaHa: profile.areaHa, priceBdtPerKg },
  }, () =>
    computeFinancials({
      cropId: picked,
      areaHa: profile.areaHa,
      yieldTPerHa: variety?.yieldTPerHa ?? 0,
      priceBdtPerKg,
      fertDosePerHa: fert
        ? { urea: fert.urea, tsp: fert.tsp, mop: fert.mop, gypsum: fert.gypsum, zinc: fert.zinc }
        : { urea: 0, tsp: 0, mop: 0, gypsum: 0, zinc: 0 },
      seedCostPerHa: 1500,
      landPrepPerHa: 6000,
      pesticidePerHa: 1500,
      harvestPerHa: 3500,
      transportPerHa: 1200,
      otherPerHa: 800,
      irrigation: { count: events, costPerIrrigationPerHa: 1200 },
      labor: { daysPerHa: 25, ratePerDay: 500 },
    }),
  );
  const financials = finT.result;
  const finStep = finT.event.stepId;
  numbers.push(
    { label: "expectedYieldKg", value: financials.expectedYieldKg, stepId: finStep },
    { label: "totalCostBdt", value: Math.round(financials.totalCostBdt), stepId: finStep },
    { label: "grossRevenueBdt", value: Math.round(financials.grossRevenueBdt), stepId: finStep },
    { label: "netProfitBdt", value: Math.round(financials.netProfitBdt), stepId: finStep },
    { label: "roiPercent", value: Math.round(financials.roiPercent), stepId: finStep },
    { label: "breakEvenPriceBdtPerKg", value: round2(financials.breakEvenPriceBdtPerKg), stepId: finStep },
  );

  // --- Step 8: basis block (code-built) ---
  const cropDisplay = loadTable("crops.csv").find((r) => r.cropId === picked)?.displayName ?? picked;
  const basis = buildRecommendationBasis({
    profile,
    chosenCropDisplay: cropDisplay,
    fertilityAssumption: undefined,
    forecast,
    normals,
    seasonRainMm,
    financials,
    priceBdtPerKg,
    priceSource: priceRow?.source.source_name ?? "n/a",
    priceDate: priceRow?.date ?? "n/a",
  });

  return {
    ranking,
    chosen,
    plan,
    financials,
    basis,
    numbers,
    weatherAvailable: forecast !== null,
    trace: (writer as { events?: TraceEvent[] }).events ?? [],
  };
}

/** Candidate crops that fit the target season (for honest "<3 fit" handling). */
export function seasonFittingCrops(targetSeason: Season): CropId[] {
  return [...CROP_IDS].filter((c) => {
    const cal = loadTable("crop_calendar.csv").find((r) => r.cropId === c);
    return cal?.season === targetSeason;
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
