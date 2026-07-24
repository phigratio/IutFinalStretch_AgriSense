/**
 * Deterministic Tier-0 crop ranking, finance, and season-plan engine.
 * The LLM does not compute these numbers; it may only explain them later.
 */
import { type IntakeProfile } from "../agent/intakeSchema.js";
import { generateSeasonPlan as generateStructuredSeasonPlan, type SeasonTask } from "../agent/seasonPlan.js";
import { type WaterAvailability } from "../agent/ranking.js";
import { DEFAULT_INPUT_PRICES } from "../engines/financials.js";
import { type CropId } from "../data/crops.js";
import { type FertilityClass } from "../data/loader.js";
import {
  type CostBreakdownItem,
  type CropRecommendation,
  type FinancialProjection,
  type RetrievedEvidence,
  type SeasonPlanResult,
  type SeasonPlanTask,
  type SchedulerSummary,
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

export function rankCrops(profile: IntakeProfile, weather: WeatherForecast, evidence: RetrievedEvidence[] = [], limit = 3): CropRecommendation[] {
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
    .slice(0, limit);
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
  const cropId = resolveStructuredCropId(crop.crop, profile.targetSeason);
  const fertility = resolveFertility(profile);
  const structured = cropId
    ? generateStructuredSeasonPlan({
        cropId,
        areaHa: acresToHa(area),
        fertilityClass: fertility.class,
        waterAvailability: normalizeSchedulerWater(profile.waterAvailability),
        anchorDate: new Date(`${sowDate}T00:00:00Z`),
        forecast: {
          daily: weather.daily.map((day) => ({ date: day.date, rainMm: day.rainfallMm })),
        },
      })
    : undefined;
  const scheduledTasks = structured?.tasks ?? fallbackStructuredTasks(profile, crop, sowDate, harvestStartDate, harvestEndDate);
  const { tasks, summary } = buildSchedulerTasks({
    crop,
    profile,
    financials,
    structuredCropId: cropId,
    fertility,
    tasks: scheduledTasks,
  });

  return {
    crop: crop.crop,
    sowDate: structured?.anchorDate ?? sowDate,
    harvestStartDate: tasks.find((task) => task.phase === "harvest")?.startDate ?? harvestStartDate,
    harvestEndDate: tasks.find((task) => task.phase === "harvest")?.endDate ?? harvestEndDate,
    tasks,
    financials,
    schedulerSummary: summary,
    reasoning: `Recommended ${crop.crop} because profile inputs (${profile.locationText}, ${profile.sizeAcres} acres, ${profile.soilType}, ${profile.waterAvailability}, ৳${profile.budgetBdt}, ${profile.targetSeason}) and weather (${weather.daily[0]?.rainfallMm ?? 0}mm rain today, ${weather.daily[0]?.temperatureMaxC ?? 0}C max) produce the highest suitability among ranked crops.`,
    selectedCropReason: options.selectedCropReason ?? `Selected ${crop.crop} from crop ranking.`,
    sourceTraceIds: options.sourceTraceIds ?? [],
    automationTrigger: options.triggerReason ?? "intake_completed",
    retrievedEvidence: options.retrievedEvidence ?? [],
  };
}

interface SchedulerBuildInput {
  crop: CropRecommendation;
  profile: IntakeProfile;
  financials: FinancialProjection;
  structuredCropId?: CropId;
  fertility: {
    class: FertilityClass;
    source: string;
  };
  tasks: SeasonTask[];
}

function buildSchedulerTasks(input: SchedulerBuildInput): { tasks: SeasonPlanTask[]; summary: SchedulerSummary } {
  const fertilizerBudget = amountFor(input.financials.costBreakdown, "fertilizer");
  const irrigationBudget = amountFor(input.financials.costBreakdown, "irrigation");
  const fertilizerTasks = input.tasks.filter((task) => isFertilizerStage(task.stage));
  const irrigationTasks = input.tasks.filter((task) => task.stage === "irrigation");
  const fertilizerWeights = fertilizerTasks.map((task) => fertilizerRawCost(task));
  const fertilizerWeightTotal = fertilizerWeights.reduce((sum, value) => sum + value, 0);
  const irrigationCostPerTask = irrigationTasks.length > 0 ? roundMoney(irrigationBudget / irrigationTasks.length) : undefined;

  const tasks = input.tasks.map((task) => {
    const phase = mapSchedulerPhase(task.stage);
    const rawInputs = task.inputs.map((item) => ({
      item: item.item,
      quantity: item.qtyForArea,
      unit: item.unit,
    }));
    const taskIndex = fertilizerTasks.indexOf(task);
    const allocatedFertilizerCost = taskIndex >= 0
      ? allocateCost(fertilizerBudget, fertilizerWeights[taskIndex] ?? 0, fertilizerWeightTotal, taskIndex, fertilizerTasks.length)
      : undefined;
    const inputCostWeightTotal = rawInputs.reduce((sum, item) => sum + inputUnitPrice(item.item) * item.quantity, 0);
    const inputs = rawInputs.map((item, itemIndex) => {
      const rawCost = inputUnitPrice(item.item) * item.quantity;
      const totalCostBdt = allocatedFertilizerCost === undefined
        ? undefined
        : allocateCost(allocatedFertilizerCost, rawCost, inputCostWeightTotal, itemIndex, rawInputs.length);
      return {
        ...item,
        unitCostBdt: item.quantity > 0 && totalCostBdt !== undefined ? roundMoney(totalCostBdt / item.quantity) : undefined,
        totalCostBdt,
      };
    });
    const irrigationCost = phase === "irrigation" ? irrigationCostPerTask : undefined;
    const quantity = inputs.length > 0
      ? round2(inputs.reduce((sum, item) => sum + item.quantity, 0))
      : phase === "irrigation"
        ? 1
        : undefined;

    return {
      phase,
      title: titleForSchedulerTask(task),
      description: task.action,
      startDate: task.windowStart,
      endDate: task.windowEnd,
      growthStage: formatStage(task.stage),
      organicAlternative: phase === "fertilizer"
        ? organicFertilizerAlternative(input.profile.soilType, input.profile.sizeAcres ?? 1)
        : phase === "irrigation"
          ? "Mulch with crop residue, compost, or rice straw to reduce evaporation before buying extra pump hours."
          : undefined,
      inputs: phase === "irrigation" && inputs.length === 0
        ? [{ item: "Irrigation event", quantity: 1, unit: "event", totalCostBdt: irrigationCost, unitCostBdt: irrigationCost }]
        : inputs,
      source: task.source,
      weatherNote: task.weatherNote,
      delayRecommended: Boolean(task.weatherNote),
      quantity,
      unit: inputs.length > 0 ? "kg inputs" : phase === "irrigation" ? "event" : undefined,
      unitCostBdt: quantity && taskTotalCost(inputs, irrigationCost) ? roundMoney(taskTotalCost(inputs, irrigationCost)! / quantity) : undefined,
      totalCostBdt: taskTotalCost(inputs, irrigationCost),
      reasoning: [
        task.source,
        task.weatherNote,
        phase === "fertilizer" ? `FRG dose scaled to ${(input.profile.sizeAcres ?? 1).toFixed(2)} acres and ${input.fertility.class} fertility.` : undefined,
        phase === "irrigation" ? `${input.crop.crop} water need is ${input.crop.waterNeed}; farm water source is ${input.profile.waterAvailability ?? "unknown"}.` : undefined,
      ].filter(Boolean).join(" "),
    };
  });

  return {
    tasks,
    summary: {
      cropId: input.structuredCropId,
      fertilityClass: input.fertility.class,
      fertilitySource: input.fertility.source,
      totalFertilizerCostBdt: roundMoney(tasks.filter((task) => task.phase === "fertilizer").reduce((sum, task) => sum + (task.totalCostBdt ?? 0), 0)),
      totalIrrigationCostBdt: roundMoney(tasks.filter((task) => task.phase === "irrigation").reduce((sum, task) => sum + (task.totalCostBdt ?? 0), 0)),
      fertilizerTotals: fertilizerTotals(tasks),
      irrigationEvents: tasks.filter((task) => task.phase === "irrigation").length,
      rainDelayWarnings: tasks.filter((task) => task.delayRecommended).length,
      sources: uniqueStrings(tasks.map((task) => task.source ?? "")),
    },
  };
}

function fallbackStructuredTasks(
  profile: IntakeProfile,
  crop: CropRecommendation,
  sowDate: string,
  harvestStartDate: string,
  harvestEndDate: string,
): SeasonTask[] {
  return [
    {
      stage: "land_preparation",
      action: `Prepare ${profile.sizeAcres ?? 1} acres and reserve input budget before sowing.`,
      windowStart: addDays(sowDate, -10),
      windowEnd: addDays(sowDate, -3),
      inputs: [],
      source: "seeded crop baseline",
    },
    {
      stage: "sowing",
      action: `Sow ${crop.crop} when the short-range rainfall window is manageable.`,
      windowStart: sowDate,
      windowEnd: addDays(sowDate, 3),
      inputs: [],
      source: "seeded crop baseline",
    },
    {
      stage: "harvest",
      action: `Harvest ${crop.crop} and prepare sale/storage decision from market price.`,
      windowStart: harvestStartDate,
      windowEnd: harvestEndDate,
      inputs: [],
      source: "seeded crop baseline",
    },
  ];
}

function resolveStructuredCropId(crop: string, season?: string): CropId | undefined {
  const normalizedCrop = crop.toLowerCase();
  const normalizedSeason = normalizePlanningSeason(season);
  if (normalizedCrop === "rice") return normalizedSeason === "boro" ? "rice_boro" : "rice_t_aman";
  if (normalizedCrop === "maize") return "maize";
  if (normalizedCrop === "potato") return "potato";
  if (normalizedCrop === "mustard") return "mustard";
  return undefined;
}

function resolveFertility(profile: IntakeProfile): { class: FertilityClass; source: string } {
  const raw = (profile as IntakeProfile & { fertilityClass?: string; fertilitySource?: string }).fertilityClass;
  if (raw === "low" || raw === "medium" || raw === "high") {
    return {
      class: raw,
      source: (profile as IntakeProfile & { fertilitySource?: string }).fertilitySource ?? "farm_profile",
    };
  }
  return { class: "medium", source: "default_medium_when_no_soil_test" };
}

function normalizeSchedulerWater(value?: string): WaterAvailability {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("rain")) return "rainfed";
  if (normalized.includes("limited")) return "limited_irrigation";
  if (normalized.includes("tubewell") || normalized.includes("tube") || normalized.includes("canal") || normalized.includes("river") || normalized.includes("mixed")) {
    return "reliable_irrigation";
  }
  if (normalized.includes("pond")) return "limited_irrigation";
  return "limited_irrigation";
}

function acresToHa(acres: number): number {
  return round2(acres * 0.404686);
}

function isFertilizerStage(stage: string): boolean {
  return stage === "basal_fertilizer" || stage === "urea_topdress";
}

function mapSchedulerPhase(stage: string): SeasonPlanTask["phase"] {
  if (stage === "land_preparation") return "land-prep";
  if (stage === "seedling_preparation" || stage === "seed_preparation" || stage === "sowing" || stage === "transplanting" || stage === "planting") return "sowing";
  if (isFertilizerStage(stage)) return "fertilizer";
  if (stage === "irrigation") return "irrigation";
  if (stage === "weeding") return "weed";
  if (stage === "pest_scouting") return "pest-check";
  if (stage === "harvest") return "harvest";
  return "sowing";
}

function titleForSchedulerTask(task: SeasonTask): string {
  if (task.stage === "basal_fertilizer") return "Apply basal fertilizer";
  if (task.stage === "urea_topdress") return task.action.replace(/\.$/, "");
  if (task.stage === "irrigation") return task.action.replace(/\.$/, "");
  return formatStage(task.stage);
}

function formatStage(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fertilizerRawCost(task: SeasonTask): number {
  return task.inputs.reduce((sum, input) => sum + inputUnitPrice(input.item) * input.qtyForArea, 0);
}

function inputUnitPrice(item: string): number {
  const normalized = item.toLowerCase();
  if (normalized.includes("urea")) return DEFAULT_INPUT_PRICES.urea;
  if (normalized.includes("tsp")) return DEFAULT_INPUT_PRICES.tsp;
  if (normalized.includes("mop")) return DEFAULT_INPUT_PRICES.mop;
  if (normalized.includes("gypsum")) return DEFAULT_INPUT_PRICES.gypsum;
  if (normalized.includes("zinc")) return DEFAULT_INPUT_PRICES.zinc;
  return 1;
}

function allocateCost(total: number, weight: number, weightTotal: number, index: number, count: number): number {
  if (count <= 0) return 0;
  if (weightTotal <= 0) return roundMoney(total / count);
  const raw = total * (weight / weightTotal);
  return index === count - 1 ? roundMoney(total - roundMoney(total * ((weightTotal - weight) / weightTotal))) : roundMoney(raw);
}

function taskTotalCost(
  inputs: NonNullable<SeasonPlanTask["inputs"]>,
  fallback?: number,
): number | undefined {
  const inputTotal = inputs.reduce((sum, input) => sum + (input.totalCostBdt ?? 0), 0);
  if (inputTotal > 0) return roundMoney(inputTotal);
  return fallback;
}

function fertilizerTotals(tasks: SeasonPlanTask[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const task of tasks.filter((item) => item.phase === "fertilizer")) {
    for (const input of task.inputs ?? []) {
      totals[input.item] = round2((totals[input.item] ?? 0) + input.quantity);
    }
  }
  return totals;
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
