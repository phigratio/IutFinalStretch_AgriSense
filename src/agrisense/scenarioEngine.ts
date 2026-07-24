import { randomUUID } from "node:crypto";
import { type IntakeProfile, type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { buildSeasonPlan, rankCrops, selectCrop } from "./planningEngine.js";
import {
  type CropRecommendation,
  type RetrievedEvidence,
  type ScenarioComparison,
  type ScenarioDeltas,
  type ScenarioSimulationResult,
  type SeasonPlanResult,
  type WeatherForecast,
} from "./types.js";

export interface ScenarioBaseline {
  sessionId?: string;
  farmId?: string;
  planId?: string;
  farmProfile: IntakeProfile;
  weather: WeatherForecast;
  cropRankings: CropRecommendation[];
  seasonPlan: SeasonPlanResult;
  retrievedEvidence?: RetrievedEvidence[];
}

export interface ScenarioSimulationInput {
  message?: string;
  deltas?: ScenarioDeltas;
  baseline: ScenarioBaseline;
  selectedCrop?: string;
}

export function extractScenarioDeltas(message = "", explicit: ScenarioDeltas = {}): ScenarioDeltas {
  const parsed: ScenarioDeltas = {};
  const normalized = message.toLowerCase();

  assignPct(parsed, "rainfallPct", explicit.rainfallPct ?? matchPct(normalized, [
    /rain(?:fall)?\s+(?:drops?|falls?|decreases?|kom(?:le)?|kome|কম(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
    /(?:bristi|brishti|বৃষ্টি|rain)\s+(\d+(?:\.\d+)?)\s*%?\s+(?:kom(?:le)?|kome|কম(?:লে)?|less|drop)/i,
    /(?:rainfall|rain|bristi|brishti|বৃষ্টি).*?(\d+(?:\.\d+)?)\s*%?\s+(?:down|lower|less|কম)/i,
  ], -1));
  assignPct(parsed, "rainfallPct", explicit.rainfallPct ?? matchPct(normalized, [
    /rain(?:fall)?\s+(?:increases?|rises?|barle|bare|বাড়(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
  ], 1));
  assignPct(parsed, "budgetPct", explicit.budgetPct ?? matchPct(normalized, [
    /budget\s+(?:is\s+)?(?:cut|cuts|drops?|falls?|decreases?|kom(?:le)?|kome|কম(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
    /(?:budget|বাজেট)\s+(\d+(?:\.\d+)?)\s*%?\s+(?:cut|kom(?:le)?|kome|less|কম)/i,
  ], -1));
  assignPct(parsed, "budgetPct", explicit.budgetPct ?? matchPct(normalized, [
    /budget\s+(?:increases?|rises?|barle|bare|বাড়(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
  ], 1));
  assignPct(parsed, "pricePct", explicit.pricePct ?? matchPct(normalized, [
    /price\s+(?:drops?|falls?|decreases?|kom(?:le)?|kome|কম(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
    /(?:dam|দাম|price)\s+(\d+(?:\.\d+)?)\s*%?\s+(?:kom(?:le)?|kome|less|fall|কম)/i,
  ], -1));
  assignPct(parsed, "pricePct", explicit.pricePct ?? matchPct(normalized, [
    /price\s+(?:increases?|rises?|barle|bare|বাড়(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
  ], 1));
  assignPct(parsed, "costPct", explicit.costPct ?? matchPct(normalized, [
    /(?:input\s+)?cost\s+(?:increases?|rises?|barle|bare|বাড়(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
  ], 1));
  assignPct(parsed, "yieldPct", explicit.yieldPct ?? matchPct(normalized, [
    /yield\s+(?:drops?|falls?|decreases?|kom(?:le)?|kome|কম(?:লে)?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%?/i,
  ], -1));

  return { ...parsed, ...definedDeltas(explicit) };
}

export function simulateScenario(input: ScenarioSimulationInput): ScenarioSimulationResult {
  const trace: IntakeTraceEvent[] = [];
  const deltas = extractScenarioDeltas(input.message, input.deltas);
  if (Object.keys(deltas).length === 0) {
    throw new Error("Scenario must include a percent change such as rainfall -30% or budget -40%");
  }
  trace.push(traceEvent("scenario.extract", { message: input.message, explicitDeltas: input.deltas }, { deltas }));

  const baseline = input.baseline;
  const scenarioProfile = patchProfile(baseline.farmProfile, deltas);
  const scenarioWeather = patchWeather(baseline.weather, deltas);
  trace.push(traceEvent("scenario.patch_inputs", { deltas }, {
    baselineBudgetBdt: baseline.farmProfile.budgetBdt,
    scenarioBudgetBdt: scenarioProfile.budgetBdt,
    baselineRain7dMm: rain7d(baseline.weather),
    scenarioRain7dMm: rain7d(scenarioWeather),
  }));

  const evidence = baseline.retrievedEvidence ?? baseline.seasonPlan.retrievedEvidence ?? [];
  const scenarioRankings = rankCrops(scenarioProfile, scenarioWeather, evidence, 5)
    .map((crop) => patchCropEconomics(crop, deltas, baseline.farmProfile, scenarioProfile));
  const requestedCrop = input.selectedCrop ?? baseline.seasonPlan.crop;
  const selected = selectCrop(scenarioRankings, requestedCrop);
  const scenarioPlan = applyScenarioPlanAdjustments(
    buildSeasonPlan(scenarioProfile, scenarioWeather, selected.crop, {
      triggerReason: "scenario_simulation",
      selectedCropReason: selected.reason,
      sourceTraceIds: [],
      retrievedEvidence: evidence,
    }),
    baseline,
    deltas,
  );
  trace.push(traceEvent("scenario.recalculate", { selectedCrop: requestedCrop, deltas }, {
    cropRankings: scenarioRankings.map((crop) => ({
      crop: crop.crop,
      suitabilityScore: crop.suitabilityScore,
      waterFit: crop.factors.waterFit,
      budgetFit: crop.factors.budgetFit,
      netProfitBdt: crop.netProfitBdt,
      roiPct: crop.roiPct,
    })),
    scenarioFinancials: scenarioPlan.financials,
  }));

  const comparison = comparePlans(baseline.seasonPlan, baseline.weather, scenarioPlan, scenarioWeather);
  trace.push(traceEvent("scenario.compare", { baselinePlanId: baseline.planId ?? baseline.seasonPlan.id }, comparison));

  return {
    sessionId: baseline.sessionId,
    farmId: baseline.farmId ?? baseline.farmProfile.farmId,
    planId: baseline.planId ?? baseline.seasonPlan.id,
    scenarioLabel: labelForDeltas(deltas),
    deltas,
    baseline: {
      farmProfile: baseline.farmProfile,
      weather: baseline.weather,
      cropRankings: baseline.cropRankings,
      seasonPlan: baseline.seasonPlan,
    },
    scenario: {
      farmProfile: scenarioProfile,
      weather: scenarioWeather,
      cropRankings: scenarioRankings.slice(0, 3),
      seasonPlan: scenarioPlan,
    },
    comparison,
    recommendation: recommendationForScenario(deltas, baseline.seasonPlan, scenarioPlan, comparison),
    trace,
  };
}

function patchProfile(profile: IntakeProfile, deltas: ScenarioDeltas): IntakeProfile {
  return {
    ...profile,
    budgetBdt: deltas.budgetPct === undefined || profile.budgetBdt === undefined
      ? profile.budgetBdt
      : roundMoney(profile.budgetBdt * factor(deltas.budgetPct)),
  };
}

function patchWeather(weather: WeatherForecast, deltas: ScenarioDeltas): WeatherForecast {
  if (deltas.rainfallPct === undefined) return weather;
  const rainfallPct = deltas.rainfallPct;
  return {
    ...weather,
    daily: weather.daily.map((day) => ({
      ...day,
      rainfallMm: round2(Math.max(0, day.rainfallMm * factor(rainfallPct))),
      soilMoisture0To9cm: day.soilMoisture0To9cm === undefined
        ? undefined
        : round2(Math.max(0, day.soilMoisture0To9cm * factor(rainfallPct))),
    })),
    raw: {
      baselineProvider: weather.provider,
      scenario: { deltas },
      baselineRaw: weather.raw,
    },
  };
}

function patchCropEconomics(
  crop: CropRecommendation,
  deltas: ScenarioDeltas,
  baselineProfile: IntakeProfile,
  scenarioProfile: IntakeProfile,
): CropRecommendation {
  const rainfallYieldPct = rainfallYieldDeltaPct(crop, deltas, baselineProfile);
  const yieldPct = (deltas.yieldPct ?? 0) + rainfallYieldPct;
  const expectedYieldKg = Math.max(0, Math.round(crop.expectedYieldKg * factor(yieldPct)));
  const pricePerKg = crop.expectedYieldKg > 0 ? crop.expectedRevenueBdt / crop.expectedYieldKg : 0;
  const scenarioPrice = pricePerKg * factor(deltas.pricePct ?? 0);
  const totalCostBdt = roundMoney(crop.totalCostBdt * factor(deltas.costPct ?? 0));
  const expectedRevenueBdt = roundMoney(expectedYieldKg * scenarioPrice);
  const netProfitBdt = roundMoney(expectedRevenueBdt - totalCostBdt);
  const budgetFit = (scenarioProfile.budgetBdt ?? 0) > 0 ? clamp((scenarioProfile.budgetBdt ?? 0) / totalCostBdt, 0, 1) : crop.factors.budgetFit;

  return {
    ...crop,
    suitabilityScore: Math.round(clamp(crop.suitabilityScore + yieldPct * 0.35 + (budgetFit - crop.factors.budgetFit) * 10, 1, 100)),
    expectedYieldKg,
    expectedRevenueBdt,
    totalCostBdt,
    netProfitBdt,
    roiPct: totalCostBdt > 0 ? round2((netProfitBdt / totalCostBdt) * 100) : 0,
    breakEvenYieldKg: scenarioPrice > 0 ? round2(totalCostBdt / scenarioPrice) : 0,
    factors: {
      ...crop.factors,
      budgetFit,
    },
    reasoning: `${crop.reasoning} Scenario adjusted yield by ${round2(yieldPct)}%, price by ${deltas.pricePct ?? 0}%, cost by ${deltas.costPct ?? 0}%, and budget by ${deltas.budgetPct ?? 0}%.`,
  };
}

function applyScenarioPlanAdjustments(
  plan: SeasonPlanResult,
  baseline: ScenarioBaseline,
  deltas: ScenarioDeltas,
): SeasonPlanResult {
  const extraIrrigationEvents = extraIrrigationEventCount(plan, baseline.farmProfile, deltas);
  if (extraIrrigationEvents <= 0) {
    return {
      ...plan,
      reasoning: `${plan.reasoning} Scenario simulation applied ${labelForDeltas(deltas)}.`,
    };
  }

  const area = baseline.farmProfile.sizeAcres ?? 1;
  const extraCostBdt = roundMoney(extraIrrigationEvents * area * 1200);
  const irrigationItem = plan.financials.costBreakdown.find((item) => item.category === "irrigation");
  const costBreakdown = plan.financials.costBreakdown.map((item) => item.category === "irrigation"
    ? {
        ...item,
        amountBdt: item.amountBdt + extraCostBdt,
        reasoning: `${item.reasoning} Scenario adds ${extraIrrigationEvents} pump/check irrigation event(s) because rainfall was reduced.`,
      }
    : item);
  if (!irrigationItem) {
    costBreakdown.push({
      category: "irrigation",
      label: "Scenario extra irrigation",
      amountBdt: extraCostBdt,
      reasoning: `Added ${extraIrrigationEvents} irrigation event(s) for the rainfall stress scenario.`,
    });
  }
  const totalCostBdt = costBreakdown.reduce((sum, item) => sum + item.amountBdt, 0);
  const netProfitBdt = roundMoney(plan.financials.expectedRevenueBdt - totalCostBdt);
  const pricePerKgBdt = plan.financials.expectedYieldKg > 0
    ? round2(plan.financials.expectedRevenueBdt / plan.financials.expectedYieldKg)
    : plan.financials.pricePerKgBdt;
  const startDate = plan.tasks.find((task) => task.phase === "irrigation")?.startDate ?? plan.sowDate;
  const extraTask = {
    phase: "irrigation" as const,
    title: "Scenario extra irrigation reserve",
    description: `Add ${extraIrrigationEvents} irrigation event(s) if rainfall is lower than the baseline forecast.`,
    startDate,
    endDate: startDate,
    growthStage: "Scenario water stress",
    organicAlternative: "Use mulching and field channels to reduce paid pumping where possible.",
    inputs: [{ item: "Pump irrigation event", quantity: extraIrrigationEvents, unit: "event", unitCostBdt: roundMoney(extraCostBdt / extraIrrigationEvents), totalCostBdt: extraCostBdt }],
    source: "scenario.simulate",
    weatherNote: `Rainfall scenario is ${deltas.rainfallPct}%.`,
    delayRecommended: false,
    quantity: extraIrrigationEvents,
    unit: "event",
    unitCostBdt: roundMoney(extraCostBdt / extraIrrigationEvents),
    totalCostBdt: extraCostBdt,
    reasoning: `Bangladesh rainfed/limited-water scenario adds pump reserve at ৳1,200 per acre per event.`,
  };

  return {
    ...plan,
    tasks: [...plan.tasks, extraTask],
    financials: {
      ...plan.financials,
      totalCostBdt,
      netProfitBdt,
      roiPct: totalCostBdt > 0 ? round2((netProfitBdt / totalCostBdt) * 100) : 0,
      breakEvenYieldKg: pricePerKgBdt > 0 ? round2(totalCostBdt / pricePerKgBdt) : 0,
      budgetSurplusBdt: roundMoney(plan.financials.budgetBdt - totalCostBdt),
      costBreakdown,
    },
    schedulerSummary: plan.schedulerSummary
      ? {
          ...plan.schedulerSummary,
          totalIrrigationCostBdt: plan.schedulerSummary.totalIrrigationCostBdt + extraCostBdt,
          irrigationEvents: plan.schedulerSummary.irrigationEvents + extraIrrigationEvents,
        }
      : plan.schedulerSummary,
    reasoning: `${plan.reasoning} Scenario simulation applied ${labelForDeltas(deltas)} and added irrigation reserve for lower rainfall.`,
  };
}

function comparePlans(
  baseline: SeasonPlanResult,
  baselineWeather: WeatherForecast,
  scenario: SeasonPlanResult,
  scenarioWeather: WeatherForecast,
): ScenarioComparison {
  return {
    revenueBdt: roundMoney(scenario.financials.expectedRevenueBdt - baseline.financials.expectedRevenueBdt),
    costBdt: roundMoney(scenario.financials.totalCostBdt - baseline.financials.totalCostBdt),
    netProfitBdt: roundMoney(scenario.financials.netProfitBdt - baseline.financials.netProfitBdt),
    roiPct: round2(scenario.financials.roiPct - baseline.financials.roiPct),
    breakEvenYieldKg: round2(scenario.financials.breakEvenYieldKg - baseline.financials.breakEvenYieldKg),
    irrigationEvents: irrigationEvents(scenario) - irrigationEvents(baseline),
    rainfall7dMm: round2(rain7d(scenarioWeather) - rain7d(baselineWeather)),
    budgetSurplusBdt: roundMoney(scenario.financials.budgetSurplusBdt - baseline.financials.budgetSurplusBdt),
  };
}

function recommendationForScenario(
  deltas: ScenarioDeltas,
  baseline: SeasonPlanResult,
  scenario: SeasonPlanResult,
  comparison: ScenarioComparison,
): string {
  const parts: string[] = [];
  if ((deltas.rainfallPct ?? 0) < 0) {
    parts.push(`Rainfall stress lowers the 7-day rain baseline by ${Math.abs(comparison.rainfall7dMm)} mm and adds ${Math.max(0, comparison.irrigationEvents)} irrigation event(s).`);
  }
  if ((deltas.budgetPct ?? 0) < 0) {
    parts.push(`Budget is tighter, leaving ${formatMoney(scenario.financials.budgetSurplusBdt)} surplus after planned costs.`);
  }
  if (comparison.netProfitBdt < 0) {
    parts.push(`Net profit falls by ${formatMoney(Math.abs(comparison.netProfitBdt))}; keep ${scenario.crop} only if water and input cash are secured.`);
  } else {
    parts.push(`The revised ${scenario.crop} plan remains stronger than break-even, with projected net profit ${formatMoney(scenario.financials.netProfitBdt)}.`);
  }
  if (baseline.crop !== scenario.crop) {
    parts.push(`The scenario changes the selected crop from ${baseline.crop} to ${scenario.crop}.`);
  }
  return parts.join(" ");
}

function extraIrrigationEventCount(plan: SeasonPlanResult, profile: IntakeProfile, deltas: ScenarioDeltas): number {
  const rainfallPct = deltas.rainfallPct ?? 0;
  const water = profile.waterAvailability?.toLowerCase() ?? "";
  if (rainfallPct >= -15) return 0;
  if (water.includes("tubewell") || water.includes("canal") || water.includes("river") || water.includes("mixed")) return 0;
  const waterNeed = plan.tasks.some((task) => task.phase === "irrigation") || plan.financials.costBreakdown.some((item) => item.category === "irrigation");
  if (!waterNeed) return 0;
  return rainfallPct <= -30 ? 2 : 1;
}

function rainfallYieldDeltaPct(crop: CropRecommendation, deltas: ScenarioDeltas, profile: IntakeProfile): number {
  const rainfallPct = deltas.rainfallPct ?? 0;
  if (rainfallPct >= 0) return 0;
  const water = profile.waterAvailability?.toLowerCase() ?? "";
  if (water.includes("tubewell") || water.includes("canal") || water.includes("river") || water.includes("mixed")) return rainfallPct * 0.08;
  if (crop.waterNeed === "high") return rainfallPct * 0.35;
  if (crop.waterNeed === "medium") return rainfallPct * 0.22;
  return rainfallPct * 0.1;
}

function assignPct(target: ScenarioDeltas, key: keyof ScenarioDeltas, value: number | undefined): void {
  if (value !== undefined && Number.isFinite(value)) target[key] = value;
}

function matchPct(input: string, patterns: RegExp[], direction: 1 | -1): number | undefined {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1]) return direction * Number(match[1]);
  }
  return undefined;
}

function definedDeltas(deltas: ScenarioDeltas): ScenarioDeltas {
  return Object.fromEntries(Object.entries(deltas).filter(([, value]) => value !== undefined && Number.isFinite(value))) as ScenarioDeltas;
}

function labelForDeltas(deltas: ScenarioDeltas): string {
  return Object.entries(deltas)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key.replace("Pct", "")} ${value! > 0 ? "+" : ""}${value}%`)
    .join(", ");
}

function irrigationEvents(plan: SeasonPlanResult): number {
  return plan.schedulerSummary?.irrigationEvents ?? plan.tasks.filter((task) => task.phase === "irrigation").length;
}

function rain7d(weather: WeatherForecast): number {
  return round2(weather.daily.slice(0, 7).reduce((sum, day) => sum + day.rainfallMm, 0));
}

function factor(percent: number): number {
  return 1 + percent / 100;
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

function formatMoney(value: number): string {
  return `৳${Math.round(value).toLocaleString("en-BD")}`;
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
