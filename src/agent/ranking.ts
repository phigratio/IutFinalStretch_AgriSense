/**
 * Crop ranking engine (T0-3). Deterministic scoring in code — the LLM never ranks. Weights live
 * in one place and are surfaced in the trace. Only crops present in the KB are ranked; callers
 * decide how to handle "<3 fit the season" (spec §3 — that's honest missing-info behavior).
 */

import { CROP_IDS, type CropId } from "../data/crops.js";
import {
  getCalendar,
  getWaterNeedMm,
  getSoilFit,
  getFertilizer,
  getVarietyForCrop,
  getPrice,
  toSource,
  loadTable,
  type SoilTexture,
  type FertilityClass,
  type SourceColumns,
} from "../data/loader.js";
import {
  computeFinancials,
  normalizePricePerKg,
  type PriceUnit,
} from "../engines/financials.js";

export type WaterAvailability = "rainfed" | "limited_irrigation" | "reliable_irrigation";
export type Season = "kharif1" | "kharif2_aman" | "rabi" | "boro";

export const RANK_WEIGHTS = {
  seasonFit: 0.25,
  waterFit: 0.2,
  soilFit: 0.15,
  weatherFit: 0.15,
  profitPotential: 0.15,
  budgetFit: 0.1,
} as const;

/** mm of water the farmer can add on top of rainfall, by irrigation access. */
const IRRIGATION_CAPACITY_MM: Record<WaterAvailability, number> = {
  rainfed: 0,
  limited_irrigation: 300,
  reliable_irrigation: 1200,
};

const IRRIGATION_EVENTS: Record<WaterAvailability, number> = {
  rainfed: 0,
  limited_irrigation: 2,
  reliable_irrigation: 4,
};

export interface RankProfile {
  areaHa: number;
  soilTexture: SoilTexture;
  fertilityClass: FertilityClass;
  waterAvailability: WaterAvailability;
  budgetBdt: number;
  targetSeason: Season;
}

export interface WeatherSummary {
  totalRainNext7Mm?: number;
  tmeanNext7C?: number;
}

export interface NormalsSummary {
  seasonRainMm?: number;
  seasonTmeanC?: number;
}

export interface Subscores {
  seasonFit: number;
  waterFit: number;
  soilFit: number;
  weatherFit: number;
  profitPotential: number;
  budgetFit: number;
}

export interface RankedCrop {
  cropId: CropId;
  score: number;
  subscores: Subscores;
  reasons: string[];
  waterNeedMm: number;
  riskLevel: string;
  expectedYieldT: number;
  roughProfitBdt: number;
  estimatedCostBdt: number;
  fitsTargetSeason: boolean;
  sources: SourceColumns[];
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Dry land-prep crops penalized by heavy rain right now. */
const DRY_PREP_CROPS: CropId[] = ["wheat", "mustard", "lentil", "potato"];

function quickFinancials(cropId: CropId, profile: RankProfile) {
  const variety = getVarietyForCrop(cropId);
  const fert = getFertilizer(cropId, profile.fertilityClass);
  const price = getPrice(cropId);
  const priceBdtPerKg = price
    ? normalizePricePerKg(price.price, (price.unit as PriceUnit) ?? "kg")
    : 0;
  const events = IRRIGATION_EVENTS[profile.waterAvailability];
  return computeFinancials({
    cropId,
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
  });
}

export function rankCrops(
  profile: RankProfile,
  weather: WeatherSummary,
  normals: NormalsSummary,
  candidates: CropId[] = [...CROP_IDS],
): RankedCrop[] {
  const cropsMeta = loadTable("crops.csv");

  // First pass: raw metrics per crop.
  const raw = candidates.map((cropId) => {
    const calendar = getCalendar(cropId);
    const waterNeedMm = getWaterNeedMm(cropId) ?? 0;
    const variety = getVarietyForCrop(cropId);
    const price = getPrice(cropId);
    const fin = quickFinancials(cropId, profile);

    const fitsTargetSeason = calendar?.season === profile.targetSeason;
    const seasonFit = fitsTargetSeason ? 1 : 0;

    const availableWater =
      (normals.seasonRainMm ?? 400) + IRRIGATION_CAPACITY_MM[profile.waterAvailability];
    const waterFit = waterNeedMm > 0 ? clamp01(availableWater / waterNeedMm) : 0.5;

    const soilFit = getSoilFit(cropId, profile.soilTexture);

    let weatherFit = 1;
    if ((weather.totalRainNext7Mm ?? 0) > 100 && DRY_PREP_CROPS.includes(cropId)) {
      weatherFit -= 0.3;
    }
    const tmean = weather.tmeanNext7C;
    if (tmean !== undefined && (tmean < 10 || tmean > 36)) weatherFit -= 0.2;
    weatherFit = clamp01(weatherFit);

    const budgetFit =
      fin.totalCostBdt <= 0
        ? 0.5
        : fin.totalCostBdt <= profile.budgetBdt
          ? 1
          : clamp01(profile.budgetBdt / fin.totalCostBdt);

    const sources: SourceColumns[] = [];
    const cropRow = cropsMeta.find((r) => r.cropId === cropId);
    if (cropRow) sources.push(toSource(cropRow));
    if (price) sources.push(price.source);

    return {
      cropId,
      calendar,
      waterNeedMm,
      variety,
      fin,
      fitsTargetSeason,
      seasonFit,
      waterFit,
      soilFit,
      weatherFit,
      budgetFit,
      riskLevel: cropRow?.riskLevel ?? "medium",
      sources,
    };
  });

  // Normalize profit across candidates (min-max).
  const profits = raw.map((r) => r.fin.netProfitBdt);
  const minP = Math.min(...profits);
  const maxP = Math.max(...profits);
  const normProfit = (p: number): number =>
    maxP === minP ? 0.5 : clamp01((p - minP) / (maxP - minP));

  const ranked: RankedCrop[] = raw.map((r) => {
    const subscores: Subscores = {
      seasonFit: r.seasonFit,
      waterFit: r.waterFit,
      soilFit: r.soilFit,
      weatherFit: r.weatherFit,
      profitPotential: normProfit(r.fin.netProfitBdt),
      budgetFit: r.budgetFit,
    };
    const score =
      RANK_WEIGHTS.seasonFit * subscores.seasonFit +
      RANK_WEIGHTS.waterFit * subscores.waterFit +
      RANK_WEIGHTS.soilFit * subscores.soilFit +
      RANK_WEIGHTS.weatherFit * subscores.weatherFit +
      RANK_WEIGHTS.profitPotential * subscores.profitPotential +
      RANK_WEIGHTS.budgetFit * subscores.budgetFit;

    return {
      cropId: r.cropId,
      score: Math.round(score * 1000) / 1000,
      subscores,
      reasons: buildReasons(r, subscores, profile),
      waterNeedMm: r.waterNeedMm,
      riskLevel: r.riskLevel,
      expectedYieldT: (r.variety?.yieldTPerHa ?? 0) * profile.areaHa,
      roughProfitBdt: Math.round(r.fin.netProfitBdt),
      estimatedCostBdt: Math.round(r.fin.totalCostBdt),
      fitsTargetSeason: r.fitsTargetSeason,
      sources: r.sources,
    };
  });

  // Sort: season-fit first, then score, then cropId for stable ties.
  ranked.sort(
    (a, b) =>
      Number(b.fitsTargetSeason) - Number(a.fitsTargetSeason) ||
      b.score - a.score ||
      a.cropId.localeCompare(b.cropId),
  );
  return ranked;
}

function buildReasons(
  r: { fitsTargetSeason: boolean; waterNeedMm: number; soilFit: number; budgetFit: number },
  s: Subscores,
  profile: RankProfile,
): string[] {
  const reasons: string[] = [];
  reasons.push(
    r.fitsTargetSeason
      ? `Fits the ${profile.targetSeason} season window.`
      : `Off-season for ${profile.targetSeason} — shown as an alternative.`,
  );
  reasons.push(
    s.waterFit >= 0.8
      ? `Water need (${r.waterNeedMm} mm) is comfortably met by rainfall + your ${profile.waterAvailability}.`
      : `Water need (${r.waterNeedMm} mm) is tight for your ${profile.waterAvailability}.`,
  );
  reasons.push(
    s.soilFit >= 0.8
      ? `Well suited to ${profile.soilTexture} soil.`
      : `Only moderately suited to ${profile.soilTexture} soil.`,
  );
  reasons.push(
    r.budgetFit >= 1
      ? `Estimated cost fits your budget.`
      : `Estimated cost exceeds your budget — margin is tight.`,
  );
  return reasons;
}
