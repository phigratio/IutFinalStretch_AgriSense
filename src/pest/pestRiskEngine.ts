import { loadTable, type Row, type SourceColumns, toSource } from "../data/loader.js";
import { CROP_IDS, isCropId, resolveCropId, type CropId } from "../data/crops.js";
import type { WeatherForecast } from "../agrisense/types.js";

export type PestIssueType = "pest" | "disease";
export type PestSeverity = "low" | "medium" | "high";

export interface PestRule {
  ruleId: string;
  cropId: CropId;
  issueType: PestIssueType;
  issueName: string;
  growthStages: string[];
  dayMin?: number;
  dayMax?: number;
  tempMinC?: number;
  tempMaxC?: number;
  humidityMinPct?: number;
  rain3dMinMm?: number;
  rain7dMinMm?: number;
  riskBoost: number;
  symptoms: string;
  prevention: string;
  treatment: string;
  preventionCostBdtPerAcre: number;
  treatmentCostBdtPerAcre: number;
  source: SourceColumns;
}

export interface PestWeatherFeatures {
  rain3dMm: number;
  rain7dMm: number;
  avgTempC: number;
  minTempC: number;
  maxTempC: number;
  avgHumidityPct?: number;
  wetnessProxy: number;
}

export interface PestRisk {
  ruleId: string;
  cropId: CropId;
  issueType: PestIssueType;
  issueName: string;
  severity: PestSeverity;
  score: number;
  matchedConditions: string[];
  unmatchedConditions: string[];
  symptoms: string;
  prevention: {
    text: string;
    estimatedCostBdt: number;
    estimatedCostBdtPerAcre: number;
  };
  treatment: {
    text: string;
    estimatedCostBdt: number;
    estimatedCostBdtPerAcre: number;
  };
  citation: string;
  source: SourceColumns;
}

export interface PestRiskAssessmentInput {
  cropId: CropId;
  growthStage: string;
  daysAfterSowing?: number;
  areaAcres: number;
  weather: WeatherForecast;
}

export interface PestRiskAssessment {
  cropId: CropId;
  cropLabel: string;
  growthStage: string;
  daysAfterSowing?: number;
  areaAcres: number;
  weatherFeatures: PestWeatherFeatures;
  highestSeverity: PestSeverity;
  risks: PestRisk[];
  citations: string[];
  safetyNote: string;
}

const SAFETY_NOTE = "Follow local DAE/SAAO advice and product label dosage before pesticide or fungicide use.";

export function assessPestDiseaseRisk(input: PestRiskAssessmentInput): PestRiskAssessment {
  if (!isCropId(input.cropId)) {
    throw new Error(`Unsupported cropId: ${input.cropId}`);
  }
  if (!input.growthStage.trim()) {
    throw new Error("growthStage is required");
  }
  if (!Number.isFinite(input.areaAcres) || input.areaAcres <= 0) {
    throw new Error("areaAcres must be a positive number");
  }

  const normalizedStage = normalizeStage(input.growthStage);
  const weatherFeatures = summarizeWeather(input.weather);
  const risks = loadPestRules()
    .filter((rule) => rule.cropId === input.cropId)
    .map((rule) => scoreRule(rule, normalizedStage, input.daysAfterSowing, input.areaAcres, weatherFeatures))
    .filter((risk) => risk.score >= 25)
    .sort((a, b) => b.score - a.score);

  return {
    cropId: input.cropId,
    cropLabel: cropLabel(input.cropId),
    growthStage: normalizedStage,
    daysAfterSowing: input.daysAfterSowing,
    areaAcres: round2(input.areaAcres),
    weatherFeatures,
    highestSeverity: highestSeverity(risks),
    risks,
    citations: [...new Set(risks.map((risk) => risk.citation))],
    safetyNote: SAFETY_NOTE,
  };
}

export function loadPestRules(): PestRule[] {
  return loadTable("pest_disease_rules.csv", { allowMock: false }).map(toRule);
}

export function resolvePestCropId(value: string | undefined, season?: string): CropId | undefined {
  const raw = value?.trim().toLowerCase();
  if (!raw) return undefined;
  if (isCropId(raw)) return raw;
  if (raw === "rice") {
    const lowerSeason = season?.toLowerCase() ?? "";
    return lowerSeason.includes("boro") ? "rice_boro" : "rice_t_aman";
  }
  return resolveCropId(raw) ?? undefined;
}

function scoreRule(
  rule: PestRule,
  stage: string,
  daysAfterSowing: number | undefined,
  areaAcres: number,
  weather: PestWeatherFeatures,
): PestRisk {
  const matchedConditions: string[] = [];
  const unmatchedConditions: string[] = [];
  let score = rule.riskBoost;

  if (rule.growthStages.includes(stage) || rule.growthStages.includes("all")) {
    score += 24;
    matchedConditions.push(`stage ${stage}`);
  } else {
    unmatchedConditions.push(`stage ${stage} is outside ${rule.growthStages.join(", ")}`);
    score -= 18;
  }

  if (typeof daysAfterSowing === "number" && (rule.dayMin !== undefined || rule.dayMax !== undefined)) {
    if ((rule.dayMin === undefined || daysAfterSowing >= rule.dayMin) && (rule.dayMax === undefined || daysAfterSowing <= rule.dayMax)) {
      score += 14;
      matchedConditions.push(`${daysAfterSowing} days after sowing fits ${rule.dayMin ?? 0}-${rule.dayMax ?? "end"} days`);
    } else {
      score -= 10;
      unmatchedConditions.push(`${daysAfterSowing} days after sowing is outside ${rule.dayMin ?? 0}-${rule.dayMax ?? "end"} days`);
    }
  }

  if (rule.tempMinC !== undefined && rule.tempMaxC !== undefined) {
    if (weather.avgTempC >= rule.tempMinC && weather.avgTempC <= rule.tempMaxC) {
      score += 18;
      matchedConditions.push(`avg temp ${weather.avgTempC}C fits ${rule.tempMinC}-${rule.tempMaxC}C`);
    } else {
      const distance = weather.avgTempC < rule.tempMinC ? rule.tempMinC - weather.avgTempC : weather.avgTempC - rule.tempMaxC;
      score -= Math.min(14, distance * 2);
      unmatchedConditions.push(`avg temp ${weather.avgTempC}C outside ${rule.tempMinC}-${rule.tempMaxC}C`);
    }
  }

  if (rule.humidityMinPct !== undefined) {
    const humidity = weather.avgHumidityPct ?? 0;
    if (humidity >= rule.humidityMinPct) {
      score += 18;
      matchedConditions.push(`humidity ${humidity}% >= ${rule.humidityMinPct}%`);
    } else {
      score -= 10;
      unmatchedConditions.push(`humidity ${humidity || "n/a"}% below ${rule.humidityMinPct}%`);
    }
  }

  if (rule.rain3dMinMm !== undefined) {
    if (weather.rain3dMm >= rule.rain3dMinMm) {
      score += 12;
      matchedConditions.push(`3-day rain ${weather.rain3dMm}mm >= ${rule.rain3dMinMm}mm`);
    } else if (rule.rain3dMinMm > 0) {
      score -= 6;
      unmatchedConditions.push(`3-day rain ${weather.rain3dMm}mm below ${rule.rain3dMinMm}mm`);
    }
  }

  if (rule.rain7dMinMm !== undefined) {
    if (weather.rain7dMm >= rule.rain7dMinMm) {
      score += 10;
      matchedConditions.push(`7-day rain ${weather.rain7dMm}mm >= ${rule.rain7dMinMm}mm`);
    } else if (rule.rain7dMinMm > 0) {
      score -= 5;
      unmatchedConditions.push(`7-day rain ${weather.rain7dMm}mm below ${rule.rain7dMinMm}mm`);
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    ruleId: rule.ruleId,
    cropId: rule.cropId,
    issueType: rule.issueType,
    issueName: rule.issueName,
    severity: severityForScore(finalScore),
    score: finalScore,
    matchedConditions,
    unmatchedConditions,
    symptoms: rule.symptoms,
    prevention: {
      text: `${rule.prevention} ${SAFETY_NOTE}`,
      estimatedCostBdt: roundMoney(rule.preventionCostBdtPerAcre * areaAcres),
      estimatedCostBdtPerAcre: rule.preventionCostBdtPerAcre,
    },
    treatment: {
      text: `${rule.treatment} ${SAFETY_NOTE}`,
      estimatedCostBdt: roundMoney(rule.treatmentCostBdtPerAcre * areaAcres),
      estimatedCostBdtPerAcre: rule.treatmentCostBdtPerAcre,
    },
    citation: citation(rule),
    source: rule.source,
  };
}

function summarizeWeather(weather: WeatherForecast): PestWeatherFeatures {
  const daily = weather.daily.slice(0, 7);
  const rain3dMm = round2(daily.slice(0, 3).reduce((sum, day) => sum + day.rainfallMm, 0));
  const rain7dMm = round2(daily.reduce((sum, day) => sum + day.rainfallMm, 0));
  const minTempC = round2(Math.min(...daily.map((day) => day.temperatureMinC)));
  const maxTempC = round2(Math.max(...daily.map((day) => day.temperatureMaxC)));
  const avgTempC = round2(average(daily.map((day) => (day.temperatureMinC + day.temperatureMaxC) / 2)));
  const humidityValues = daily.map((day) => day.humidityPct).filter((value): value is number => typeof value === "number");
  const avgHumidityPct = humidityValues.length ? Math.round(average(humidityValues)) : undefined;
  return {
    rain3dMm,
    rain7dMm,
    avgTempC,
    minTempC,
    maxTempC,
    avgHumidityPct,
    wetnessProxy: round2(rain7dMm + (avgHumidityPct ?? 60) / 10),
  };
}

function toRule(row: Row): PestRule {
  return {
    ruleId: row.ruleId,
    cropId: row.cropId as CropId,
    issueType: row.issueType as PestIssueType,
    issueName: row.issueName,
    growthStages: row.growthStages.split("|").map(normalizeStage).filter(Boolean),
    dayMin: optionalNumber(row.dayMin),
    dayMax: optionalNumber(row.dayMax),
    tempMinC: optionalNumber(row.tempMinC),
    tempMaxC: optionalNumber(row.tempMaxC),
    humidityMinPct: optionalNumber(row.humidityMinPct),
    rain3dMinMm: optionalNumber(row.rain3dMinMm),
    rain7dMinMm: optionalNumber(row.rain7dMinMm),
    riskBoost: numberValue(row.riskBoost),
    symptoms: row.symptoms,
    prevention: row.prevention,
    treatment: row.treatment,
    preventionCostBdtPerAcre: numberValue(row.preventionCostBdtPerAcre),
    treatmentCostBdtPerAcre: numberValue(row.treatmentCostBdtPerAcre),
    source: toSource(row),
  };
}

function normalizeStage(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function severityForScore(score: number): PestSeverity {
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function highestSeverity(risks: PestRisk[]): PestSeverity {
  if (risks.some((risk) => risk.severity === "high")) return "high";
  if (risks.some((risk) => risk.severity === "medium")) return "medium";
  return "low";
}

function cropLabel(cropId: CropId): string {
  return cropId === "rice_t_aman" ? "Transplanted Aman Rice"
    : cropId === "rice_boro" ? "Boro Rice"
      : cropId.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function citation(rule: PestRule): string {
  return `[KB:${rule.source.source_name}${rule.source.page ? ` ${rule.source.page}` : ""}]`;
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return numberValue(value);
}

function numberValue(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function roundMoney(value: number): number {
  return Math.round(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const SUPPORTED_PEST_CROP_IDS = CROP_IDS.filter((cropId) => ["rice_t_aman", "rice_boro", "potato", "tomato"].includes(cropId));
