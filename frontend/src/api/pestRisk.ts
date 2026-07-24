import { apiFetch } from "./client.js";
import type { TraceEvent, WeatherForecast } from "./agrisense.js";

export type PestSeverity = "low" | "medium" | "high";

export interface PestRisk {
  ruleId: string;
  cropId: string;
  issueType: "pest" | "disease";
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
}

export interface PestRiskAssessment {
  id?: string;
  cropId: string;
  cropLabel: string;
  growthStage: string;
  daysAfterSowing?: number;
  areaAcres: number;
  weatherFeatures: {
    rain3dMm: number;
    rain7dMm: number;
    avgTempC: number;
    minTempC: number;
    maxTempC: number;
    avgHumidityPct?: number;
    wetnessProxy: number;
  };
  highestSeverity: PestSeverity;
  risks: PestRisk[];
  citations: string[];
  safetyNote: string;
}

export interface PestRiskResult {
  assessment: PestRiskAssessment;
  weather: WeatherForecast;
  trace: TraceEvent[];
  alertsCreated: number;
  savedAssessmentId?: string;
  context: {
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    planId?: string;
    crop?: string;
    currentCrop?: string;
    targetSeason?: string;
    locationText?: string;
    areaAcres?: number;
    sowDate?: string;
  };
}

export interface PestAssessmentRecord extends Omit<PestRiskAssessment, "id" | "weatherFeatures" | "citations" | "safetyNote"> {
  id: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  locationText: string;
  weather: WeatherForecast;
  trace: TraceEvent[];
  sourceTraceIds: string[];
  createdAt: string;
}

export function assessPestRisk(input: {
  cropId?: string;
  crop?: string;
  growthStage?: string;
  daysAfterSowing?: number;
  areaAcres?: number;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  save?: boolean;
  createAlerts?: boolean;
}): Promise<PestRiskResult> {
  return apiFetch<PestRiskResult>("/api/pest-risk/assess", {
    method: "POST",
    body: input,
  });
}

export function listPestAssessments(input: {
  farmId?: string;
  planId?: string;
  limit?: number;
} = {}): Promise<PestAssessmentRecord[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<PestAssessmentRecord[]>(`/api/pest-risk/assessments${query ? `?${query}` : ""}`);
}

export function getPestAssessment(id: string): Promise<PestAssessmentRecord> {
  return apiFetch<PestAssessmentRecord>(`/api/pest-risk/assessments/${id}`);
}
