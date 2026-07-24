/**
 * Deterministic Tier-0 crop ranking, finance, and season-plan engine.
 * The LLM does not compute these numbers; it may only explain them later.
 */
import { type IntakeProfile } from "../agent/intakeSchema.js";
import {
  type CostBreakdownItem,
  type CropRecommendation,
  type FinancialProjection,
  type RetrievedEvidence,
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

export interface BuildSeasonPlanOptions {
  triggerReason?: string;
  selectedCropReason?: string;
  sourceTraceIds?: string[];
  retrievedEvidence?: RetrievedEvidence[];
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

export function rankCrops(profile: IntakeProfile, weather: WeatherForecast, evidence: RetrievedEvidence[] = []): CropRecommendation[] {
  const area = profile.sizeAcres ?? 1;
  const budget = profile.budgetBdt ?? 0;
  const season = normalizePlanningSeason(profile.targetSeason);
  const soil = profile.soilType?.toLowerCase() ?? "";
  const meanTemp = average(weather.daily.map((day) => (day.temperatureMaxC + day.temperatureMinC) / 2));
  const rain7d = weather.daily.reduce((sum, day) => sum + day.rainfallMm, 0);

  return CROPS.map((crop) => {
    const soilFit = crop.soils.includes(soil) ? 1 : crop.soils.some((s) => soil.includes(s) || s.includes(soil)) ? 0.75 : 0.35;
    const seasonFit = crop.seasons.includes(season) ? 1 : 0.25;
    const waterFit = computeWaterFit(crop.waterNeed, profile.waterAvailability, rain7d);
    const tempFit = computeTempFit(meanTemp, crop.optimalTempMinC, crop.optimalTempMaxC);
    const evidenceFit = computeEvidenceFit(crop.crop, evidence);
    const totalCostBdt = roundMoney(crop.costBdtPerAcre * area);
    const budgetFit = budget > 0 ? clamp(budget / totalCostBdt, 0, 1) : 0.2;
    const suitabilityScore = Math.round(
      100 * (0.25 * soilFit + 0.22 * seasonFit + 0.18 * waterFit + 0.15 * tempFit + 0.1 * budgetFit + 0.1 * evidenceFit),
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
      factors: { soilFit, seasonFit, waterFit, tempFit, budgetFit, evidenceFit },
      reasoning: `${crop.crop} scored ${suitabilityScore}/100 from ${soil || "unknown"} soil, ${season || "unknown"} season, ${profile.waterAvailability ?? "unknown"} water, ${round2(rain7d)}mm 7-day rain, ${round2(meanTemp)}C mean forecast temperature, and ${Math.round(evidenceFit * 100)}% retrieved evidence fit.`,
      citations: uniqueStrings([crop.citation, ...evidence.filter((item) => item.crop === crop.crop || item.content.toLowerCase().includes(crop.crop)).map((item) => item.citation ?? item.id)]),
    };
  })
    .sort((a, b) => b.suitabilityScore - a.suitabilityScore)
    .slice(0, 3);
}

export function selectCrop(
  rankings: CropRecommendation[],
  requestedCrop?: string,
): { crop: CropRecommendation; reason: string } {
  const normalized = requestedCrop?.trim().toLowerCase();
  const requested = normalized ? rankings.find((crop) => crop.crop.toLowerCase() === normalized) : undefined;
  if (requested) {
    return {
      crop: requested,
      reason: `Selected ${requested.crop} because the farmer explicitly requested it and it was present in the ranked candidates.`,
    };
  }

  return {
    crop: rankings[0]!,
    reason: `Selected ${rankings[0]!.crop} automatically because it has the highest suitability score among the ranked crops.`,
  };
}

export function buildSeasonPlan(
  profile: IntakeProfile,
  weather: WeatherForecast,
  crop: CropRecommendation,
  options: BuildSeasonPlanOptions = {},
): SeasonPlanResult {
  const sowDate = chooseSowDate(weather);
  const duration = CROPS.find((baseline) => baseline.crop === crop.crop)?.durationDays ?? 100;
  const harvestStartDate = addDays(sowDate, duration);
  const harvestEndDate = addDays(harvestStartDate, 7);
  const area = profile.sizeAcres ?? 1;
  const financials = calculateFinancialProjection(profile, crop);
  const fertilizerCost = amountFor(financials.costBreakdown, "fertilizer");
  const irrigationCost = amountFor(financials.costBreakdown, "irrigation");
  const fertilizerStartDate = avoidHeavyRain(addDays(sowDate, 18), weather);
  const fertilizerEndDate = addDays(fertilizerStartDate, 7);
  const fertilizerQuantityKg = Math.round(fertilizerRateKgPerAcre(crop.crop, profile.soilType) * area);
  const irrigationQuantity = irrigationPlanQuantity(crop.waterNeed, profile.waterAvailability, area);

  const tasks: SeasonPlanTask[] = [
    {
      phase: "land-prep",
      title: "Prepare land and budget inputs",
      description: `Prepare ${area} acres and reserve input budget before sowing.`,
      startDate: addDays(sowDate, -10),
      endDate: addDays(sowDate, -3),
      growthStage: "pre-sowing",
      totalCostBdt: roundMoney(crop.totalCostBdt * 0.18),
      reasoning: `Scheduled before sowing because target season is ${profile.targetSeason} and the selected crop is ${crop.crop}.`,
    },
    {
      phase: "sowing",
      title: `Sow ${crop.crop}`,
      description: `Sow when the next 3-day rainfall is below heavy-rain risk.`,
      startDate: sowDate,
      endDate: addDays(sowDate, 3),
      growthStage: "sowing",
      reasoning: `Chosen from live forecast; first available window starts ${sowDate}.`,
    },
    {
      phase: "fertilizer",
      title: "Apply split fertilizer",
      description: `Apply the first split at vegetative growth; reserve the rest for later crop-stage follow-up.`,
      startDate: fertilizerStartDate,
      endDate: fertilizerEndDate,
      growthStage: "vegetative / tillering",
      organicAlternative: organicFertilizerAlternative(profile.soilType, area),
      quantity: fertilizerQuantityKg,
      unit: "kg urea equivalent",
      unitCostBdt: fertilizerQuantityKg > 0 ? roundMoney(fertilizerCost / fertilizerQuantityKg) : undefined,
      totalCostBdt: fertilizerCost,
      reasoning: fertilizerStartDate === addDays(sowDate, 18)
        ? `Quantity is tied to ${area} acres of ${profile.soilType} soil; split timing reduces loss risk and matches forecast-aware application.`
        : `Shifted after heavy rain risk so fertilizer is not applied immediately before forecast rainfall.`,
    },
    {
      phase: "irrigation",
      title: "Check irrigation need",
      description: `Irrigate only if rainfall is insufficient; prioritize soil-moisture checks before spending on pumping.`,
      startDate: addDays(sowDate, 28),
      endDate: addDays(sowDate, 35),
      growthStage: "vegetative water-demand check",
      organicAlternative: "Mulch with crop residue or compost to reduce evaporation before buying extra pump hours.",
      quantity: irrigationQuantity.quantity,
      unit: irrigationQuantity.unit,
      unitCostBdt: irrigationQuantity.quantity > 0 ? roundMoney(irrigationCost / irrigationQuantity.quantity) : undefined,
      totalCostBdt: irrigationCost,
      reasoning: `${crop.crop} has ${crop.waterNeed} water need and the farm water source is ${profile.waterAvailability}.`,
    },
    {
      phase: "weed",
      title: "Weed control checkpoint",
      description: "Inspect the field and remove weeds before crop competition reduces yield.",
      startDate: addDays(sowDate, 30),
      endDate: addDays(sowDate, 40),
      growthStage: "early vegetative",
      totalCostBdt: roundMoney(crop.totalCostBdt * 0.08),
      reasoning: "Weed checks are scheduled during early vegetative growth.",
    },
    {
      phase: "pest-check",
      title: "Pest and disease scouting",
      description: "Scout leaves and stems; apply treatment only if symptoms appear.",
      startDate: addDays(sowDate, 45),
      endDate: addDays(sowDate, 60),
      growthStage: "vegetative to reproductive transition",
      totalCostBdt: amountFor(financials.costBreakdown, "pest"),
      reasoning: `Risk level is ${crop.riskLevel}, so scouting is included before major yield loss windows.`,
    },
    {
      phase: "harvest",
      title: `Harvest ${crop.crop}`,
      description: "Harvest and prepare sale/storage decision from market price.",
      startDate: harvestStartDate,
      endDate: harvestEndDate,
      growthStage: "maturity",
      reasoning: `Harvest window uses a ${duration}-day crop duration from the seeded crop table.`,
    },
  ];

  return {
    crop: crop.crop,
    sowDate,
    harvestStartDate,
    harvestEndDate,
    tasks,
    financials,
    reasoning: `Recommended ${crop.crop} because profile inputs (${profile.locationText}, ${profile.sizeAcres} acres, ${profile.soilType}, ${profile.waterAvailability}, ৳${profile.budgetBdt}, ${profile.targetSeason}) and weather (${weather.daily[0]?.rainfallMm ?? 0}mm rain today, ${weather.daily[0]?.temperatureMaxC ?? 0}C max) produce the highest suitability among ranked crops.`,
    selectedCropReason: options.selectedCropReason ?? `Selected ${crop.crop} from crop ranking.`,
    sourceTraceIds: options.sourceTraceIds ?? [],
    automationTrigger: options.triggerReason ?? "intake_completed",
    retrievedEvidence: options.retrievedEvidence ?? [],
  };
}

function fertilizerRateKgPerAcre(crop: string, soilType?: string): number {
  const cropRate = crop === "rice" ? 50 : crop === "maize" ? 55 : crop === "potato" ? 70 : crop === "tomato" ? 65 : 35;
  const soil = soilType?.toLowerCase() ?? "";
  if (soil.includes("sandy")) return Math.round(cropRate * 1.1);
  if (soil.includes("clay")) return Math.round(cropRate * 0.95);
  return cropRate;
}

function irrigationPlanQuantity(waterNeed: CropRecommendation["waterNeed"], waterAvailability?: string, areaAcres = 1): { quantity: number; unit: string } {
  const source = waterAvailability?.toLowerCase() ?? "";
  const baseEvents = waterNeed === "high" ? 4 : waterNeed === "medium" ? 3 : 2;
  const adjustedEvents = source.includes("rain") ? Math.max(1, baseEvents - 1) : baseEvents;
  return {
    quantity: Math.round(adjustedEvents * areaAcres),
    unit: "irrigation events",
  };
}

function organicFertilizerAlternative(soilType?: string, areaAcres = 1): string {
  const compostTons = Math.max(1, Math.round(areaAcres * 1.5));
  const soil = soilType?.toLowerCase() ?? "";
  if (soil.includes("sandy")) {
    return `${compostTons} tons compost or well-rotted cow dung plus split urea to improve sandy soil nutrient holding.`;
  }
  return `${compostTons} tons compost or well-rotted cow dung before sowing, then reduce chemical top-up only after crop response is visible.`;
}

export function calculateFinancialProjection(profile: IntakeProfile, crop: CropRecommendation): FinancialProjection {
  const area = profile.sizeAcres ?? 1;
  const pricePerKgBdt = crop.expectedYieldKg > 0 ? round2(crop.expectedRevenueBdt / crop.expectedYieldKg) : 0;
  const baselineCost = crop.totalCostBdt;
  const costBreakdown: CostBreakdownItem[] = [
    {
      category: "land-prep",
      label: "Land preparation",
      amountBdt: roundMoney(baselineCost * 0.18),
      reasoning: `Scaled by ${area} acres for tillage and field preparation.`,
    },
    {
      category: "seed",
      label: "Seed or seedling",
      amountBdt: roundMoney(baselineCost * 0.12),
      reasoning: `Seed input reserve based on selected crop ${crop.crop}.`,
    },
    {
      category: "fertilizer",
      label: "Fertilizer",
      amountBdt: roundMoney(baselineCost * 0.22),
      reasoning: "Includes split fertilizer application reserve.",
    },
    {
      category: "irrigation",
      label: "Irrigation",
      amountBdt: crop.waterNeed === "high" && profile.waterAvailability === "rainfed"
        ? roundMoney(2500 * area)
        : roundMoney(1200 * area),
      reasoning: `Water cost reflects ${crop.waterNeed} crop water need and ${profile.waterAvailability ?? "unknown"} farm water source.`,
    },
    {
      category: "pest",
      label: "Pest and disease reserve",
      amountBdt: roundMoney(baselineCost * 0.1),
      reasoning: `Reserve included because crop risk level is ${crop.riskLevel}.`,
    },
    {
      category: "labor",
      label: "Labor",
      amountBdt: roundMoney(baselineCost * 0.18),
      reasoning: "Labor allocation covers sowing, weeding, and in-season checks.",
    },
    {
      category: "harvest",
      label: "Harvest and post-harvest",
      amountBdt: roundMoney(baselineCost * 0.12),
      reasoning: "Harvest reserve scales with expected production.",
    },
  ];

  const subtotal = costBreakdown.reduce((sum, item) => sum + item.amountBdt, 0);
  const contingency = Math.max(0, baselineCost - subtotal);
  costBreakdown.push({
    category: "contingency",
    label: "Contingency",
    amountBdt: contingency,
    reasoning: "Keeps the itemized cost total equal to the deterministic crop baseline.",
  });

  const totalCostBdt = costBreakdown.reduce((sum, item) => sum + item.amountBdt, 0);
  const netProfitBdt = roundMoney(crop.expectedRevenueBdt - totalCostBdt);

  return {
    expectedYieldKg: crop.expectedYieldKg,
    expectedRevenueBdt: crop.expectedRevenueBdt,
    totalCostBdt,
    netProfitBdt,
    roiPct: totalCostBdt > 0 ? round2((netProfitBdt / totalCostBdt) * 100) : 0,
    breakEvenYieldKg: pricePerKgBdt > 0 ? round2(totalCostBdt / pricePerKgBdt) : 0,
    pricePerKgBdt,
    budgetBdt: profile.budgetBdt ?? 0,
    budgetSurplusBdt: roundMoney((profile.budgetBdt ?? 0) - totalCostBdt),
    costBreakdown,
  };
}

function computeWaterFit(waterNeed: "low" | "medium" | "high", waterAvailability: string | undefined, rain7d: number): number {
  if (
    waterAvailability === "tubewell" ||
    waterAvailability === "canal" ||
    waterAvailability === "river" ||
    waterAvailability === "mixed"
  ) {
    return 1;
  }
  if (waterAvailability === "pond") return waterNeed === "high" ? 0.7 : 0.9;
  if (waterAvailability === "rainfed") {
    if (waterNeed === "low") return 0.9;
    if (waterNeed === "medium") return rain7d >= 20 ? 0.8 : 0.55;
    return rain7d >= 35 ? 0.75 : 0.35;
  }
  return 0.45;
}

function normalizePlanningSeason(season: string | undefined): string {
  const normalized = season?.toLowerCase().trim() ?? "";
  if (normalized === "monsoon" || normalized === "borsha") return "aman";
  return normalized;
}

function computeTempFit(meanTemp: number, min: number, max: number): number {
  if (meanTemp >= min && meanTemp <= max) return 1;
  const distance = meanTemp < min ? min - meanTemp : meanTemp - max;
  return clamp(1 - distance / 12, 0.1, 1);
}

function computeEvidenceFit(crop: string, evidence: RetrievedEvidence[]): number {
  if (evidence.length === 0) return 0.4;
  const normalizedCrop = crop.toLowerCase();
  const matches = evidence.filter((item) => {
    return item.crop === normalizedCrop ||
      item.title.toLowerCase().includes(normalizedCrop) ||
      item.content.toLowerCase().includes(normalizedCrop);
  }).length;
  return clamp(matches / 2, 0.35, 1);
}

function chooseSowDate(weather: WeatherForecast): string {
  for (let index = 0; index < weather.daily.length; index++) {
    const rain3d = weather.daily.slice(index, index + 3).reduce((sum, day) => sum + day.rainfallMm, 0);
    if (rain3d < 30) return weather.daily[index]!.date;
  }
  return weather.daily[0]?.date ?? new Date().toISOString().slice(0, 10);
}

function avoidHeavyRain(candidateDate: string, weather: WeatherForecast): string {
  const index = weather.daily.findIndex((day) => day.date >= candidateDate);
  if (index < 0) return candidateDate;
  const rain3d = weather.daily.slice(index, index + 3).reduce((sum, day) => sum + day.rainfallMm, 0);
  if (rain3d < 30) return candidateDate;
  return weather.daily.slice(index + 3).find((day) => day.rainfallMm < 10)?.date ?? addDays(candidateDate, 4);
}

function amountFor(items: CostBreakdownItem[], category: CostBreakdownItem["category"]): number {
  return items.find((item) => item.category === category)?.amountBdt ?? 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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
