/**
 * Deterministic Tier-0 crop ranking, finance, and season-plan engine.
 * The LLM does not compute these numbers; it may only explain them later.
 */
import { type IntakeProfile } from "../agent/intakeSchema.js";
import {
  type CropRecommendation,
  type SeasonPlanResult,
  type SeasonPlanTask,
  type WeatherForecast,
} from "./types.js";

interface CropBaseline {
  crop: string;
  seasons: string[];
  soils: string[];
  waterNeed: "low" | "medium" | "high";
  optimalTempMinC: number;
  optimalTempMaxC: number;
  yieldKgPerAcre: number;
  farmGatePriceBdtKg: number;
  costBdtPerAcre: number;
  durationDays: number;
  citation: string;
}

const CROPS: CropBaseline[] = [
  {
    crop: "rice",
    seasons: ["aman", "boro", "aus", "kharif-2"],
    soils: ["clay", "clay loam", "loam", "sandy loam"],
    waterNeed: "high",
    optimalTempMinC: 22,
    optimalTempMaxC: 34,
    yieldKgPerAcre: 1600,
    farmGatePriceBdtKg: 30,
    costBdtPerAcre: 22500,
    durationDays: 120,
    citation: "seeded:rice-baseline",
  },
  {
    crop: "maize",
    seasons: ["rabi", "kharif-1"],
    soils: ["loam", "sandy loam", "silt"],
    waterNeed: "medium",
    optimalTempMinC: 18,
    optimalTempMaxC: 32,
    yieldKgPerAcre: 2400,
    farmGatePriceBdtKg: 24,
    costBdtPerAcre: 28000,
    durationDays: 110,
    citation: "seeded:maize-baseline",
  },
  {
    crop: "potato",
    seasons: ["rabi"],
    soils: ["sandy loam", "loam"],
    waterNeed: "medium",
    optimalTempMinC: 15,
    optimalTempMaxC: 25,
    yieldKgPerAcre: 8500,
    farmGatePriceBdtKg: 16,
    costBdtPerAcre: 65000,
    durationDays: 95,
    citation: "seeded:potato-baseline",
  },
  {
    crop: "mustard",
    seasons: ["rabi"],
    soils: ["loam", "sandy loam", "silt"],
    waterNeed: "low",
    optimalTempMinC: 15,
    optimalTempMaxC: 28,
    yieldKgPerAcre: 520,
    farmGatePriceBdtKg: 75,
    costBdtPerAcre: 14500,
    durationDays: 90,
    citation: "seeded:mustard-baseline",
  },
  {
    crop: "tomato",
    seasons: ["rabi", "kharif-1"],
    soils: ["sandy loam", "loam"],
    waterNeed: "medium",
    optimalTempMinC: 18,
    optimalTempMaxC: 30,
    yieldKgPerAcre: 7000,
    farmGatePriceBdtKg: 22,
    costBdtPerAcre: 58000,
    durationDays: 100,
    citation: "seeded:tomato-baseline",
  },
];

export function rankCrops(profile: IntakeProfile, weather: WeatherForecast): CropRecommendation[] {
  const area = profile.sizeAcres ?? 1;
  const budget = profile.budgetBdt ?? 0;
  const season = profile.targetSeason?.toLowerCase() ?? "";
  const soil = profile.soilType?.toLowerCase() ?? "";
  const meanTemp = average(weather.daily.map((day) => (day.temperatureMaxC + day.temperatureMinC) / 2));
  const rain7d = weather.daily.reduce((sum, day) => sum + day.rainfallMm, 0);

  return CROPS.map((crop) => {
    const soilFit = crop.soils.includes(soil) ? 1 : crop.soils.some((s) => soil.includes(s) || s.includes(soil)) ? 0.75 : 0.35;
    const seasonFit = crop.seasons.includes(season) ? 1 : 0.25;
    const waterFit = computeWaterFit(crop.waterNeed, profile.waterAvailability, rain7d);
    const tempFit = computeTempFit(meanTemp, crop.optimalTempMinC, crop.optimalTempMaxC);
    const totalCostBdt = roundMoney(crop.costBdtPerAcre * area);
    const budgetFit = budget > 0 ? clamp(budget / totalCostBdt, 0, 1) : 0.2;
    const suitabilityScore = Math.round(
      100 * (0.3 * soilFit + 0.25 * seasonFit + 0.2 * waterFit + 0.15 * tempFit + 0.1 * budgetFit),
    );
    const expectedYieldKg = Math.round(crop.yieldKgPerAcre * area * yieldMultiplier(suitabilityScore));
    const expectedRevenueBdt = roundMoney(expectedYieldKg * crop.farmGatePriceBdtKg);
    const netProfitBdt = roundMoney(expectedRevenueBdt - totalCostBdt);
    const roiPct = totalCostBdt > 0 ? round2((netProfitBdt / totalCostBdt) * 100) : 0;
    const breakEvenYieldKg = round2(totalCostBdt / crop.farmGatePriceBdtKg);
    const riskLevel: "low" | "medium" | "high" =
      suitabilityScore >= 75 ? "low" : suitabilityScore >= 55 ? "medium" : "high";

    return {
      crop: crop.crop,
      suitabilityScore,
      waterNeed: crop.waterNeed,
      riskLevel,
      expectedYieldKg,
      expectedRevenueBdt,
      totalCostBdt,
      netProfitBdt,
      roiPct,
      breakEvenYieldKg,
      factors: { soilFit, seasonFit, waterFit, tempFit, budgetFit },
      reasoning: `${crop.crop} scored ${suitabilityScore}/100 from ${soil || "unknown"} soil, ${season || "unknown"} season, ${profile.waterAvailability ?? "unknown"} water, ${round2(rain7d)}mm 7-day rain, and ${round2(meanTemp)}C mean forecast temperature.`,
      citations: [crop.citation],
    };
  })
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, 3);
}

export function buildSeasonPlan(profile: IntakeProfile, weather: WeatherForecast, crop: CropRecommendation): SeasonPlanResult {
  const sowDate = chooseSowDate(weather);
  const duration = CROPS.find((baseline) => baseline.crop === crop.crop)?.durationDays ?? 100;
  const harvestStartDate = addDays(sowDate, duration);
  const harvestEndDate = addDays(harvestStartDate, 7);
  const area = profile.sizeAcres ?? 1;
  const fertilizerCost = roundMoney(crop.totalCostBdt * 0.22);
  const irrigationCost = crop.waterNeed === "high" && profile.waterAvailability === "rainfed" ? roundMoney(2500 * area) : roundMoney(1200 * area);

  const tasks: SeasonPlanTask[] = [
    {
      phase: "land-prep",
      title: "Prepare land and budget inputs",
      description: `Prepare ${area} acres and reserve input budget before sowing.`,
      startDate: addDays(sowDate, -10),
      endDate: addDays(sowDate, -3),
      totalCostBdt: roundMoney(crop.totalCostBdt * 0.18),
      reasoning: `Scheduled before sowing because target season is ${profile.targetSeason} and the selected crop is ${crop.crop}.`,
    },
    {
      phase: "sowing",
      title: `Sow ${crop.crop}`,
      description: `Sow when the next 3-day rainfall is below heavy-rain risk.`,
      startDate: sowDate,
      endDate: addDays(sowDate, 3),
      reasoning: `Chosen from live forecast; first available window starts ${sowDate}.`,
    },
    {
      phase: "fertilizer",
      title: "Apply split fertilizer",
      description: "Use split fertilizer timing and avoid applying right before heavy rain.",
      startDate: addDays(sowDate, 18),
      endDate: addDays(sowDate, 25),
      quantity: Math.round(45 * area),
      unit: "kg urea equivalent",
      totalCostBdt: fertilizerCost,
      reasoning: `Split timing reduces loss risk for ${profile.soilType} soil and forecast-aware application.`,
    },
    {
      phase: "irrigation",
      title: "Check irrigation need",
      description: "Irrigate only if rainfall is insufficient for the crop stage.",
      startDate: addDays(sowDate, 28),
      endDate: addDays(sowDate, 35),
      totalCostBdt: irrigationCost,
      reasoning: `${crop.crop} has ${crop.waterNeed} water need and the farm water source is ${profile.waterAvailability}.`,
    },
    {
      phase: "weed",
      title: "Weed control checkpoint",
      description: "Inspect the field and remove weeds before crop competition reduces yield.",
      startDate: addDays(sowDate, 30),
      endDate: addDays(sowDate, 40),
      totalCostBdt: roundMoney(crop.totalCostBdt * 0.08),
      reasoning: "Weed checks are scheduled during early vegetative growth.",
    },
    {
      phase: "pest-check",
      title: "Pest and disease scouting",
      description: "Scout leaves and stems; apply treatment only if symptoms appear.",
      startDate: addDays(sowDate, 45),
      endDate: addDays(sowDate, 60),
      totalCostBdt: roundMoney(crop.totalCostBdt * 0.1),
      reasoning: `Risk level is ${crop.riskLevel}, so scouting is included before major yield loss windows.`,
    },
    {
      phase: "harvest",
      title: `Harvest ${crop.crop}`,
      description: "Harvest and prepare sale/storage decision from market price.",
      startDate: harvestStartDate,
      endDate: harvestEndDate,
      reasoning: `Harvest window uses a ${duration}-day crop duration from the seeded crop table.`,
    },
  ];

  return {
    crop: crop.crop,
    sowDate,
    harvestStartDate,
    harvestEndDate,
    tasks,
    financials: {
      expectedYieldKg: crop.expectedYieldKg,
      expectedRevenueBdt: crop.expectedRevenueBdt,
      totalCostBdt: crop.totalCostBdt,
      netProfitBdt: crop.netProfitBdt,
      roiPct: crop.roiPct,
      breakEvenYieldKg: crop.breakEvenYieldKg,
    },
    reasoning: `Recommended ${crop.crop} because profile inputs (${profile.locationText}, ${profile.sizeAcres} acres, ${profile.soilType}, ${profile.waterAvailability}, ৳${profile.budgetBdt}, ${profile.targetSeason}) and weather (${weather.daily[0]?.rainfallMm ?? 0}mm rain today, ${weather.daily[0]?.temperatureMaxC ?? 0}C max) produce the highest suitability among ranked crops.`,
  };
}

function computeWaterFit(waterNeed: "low" | "medium" | "high", waterAvailability: string | undefined, rain7d: number): number {
  if (waterAvailability === "tubewell" || waterAvailability === "canal" || waterAvailability === "mixed") return 1;
  if (waterAvailability === "pond") return waterNeed === "high" ? 0.7 : 0.9;
  if (waterAvailability === "rainfed") {
    if (waterNeed === "low") return 0.9;
    if (waterNeed === "medium") return rain7d >= 20 ? 0.8 : 0.55;
    return rain7d >= 35 ? 0.75 : 0.35;
  }
  return 0.45;
}

function computeTempFit(meanTemp: number, min: number, max: number): number {
  if (meanTemp >= min && meanTemp <= max) return 1;
  const distance = meanTemp < min ? min - meanTemp : meanTemp - max;
  return clamp(1 - distance / 12, 0.1, 1);
}

function chooseSowDate(weather: WeatherForecast): string {
  for (let index = 0; index < weather.daily.length; index++) {
    const rain3d = weather.daily.slice(index, index + 3).reduce((sum, day) => sum + day.rainfallMm, 0);
    if (rain3d < 30) return weather.daily[index]!.date;
  }
  return weather.daily[0]?.date ?? new Date().toISOString().slice(0, 10);
}

function yieldMultiplier(score: number): number {
  return clamp(0.65 + score / 300, 0.65, 1);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
