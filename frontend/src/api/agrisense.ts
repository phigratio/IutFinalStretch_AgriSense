import { apiFetch } from "./client.js";

export interface IntakeProfile {
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  farmerName?: string;
  bdappsMobile?: string;
  preferredLanguage?: string;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  sizeAcres?: number;
  sizeOriginal?: {
    value: number;
    unit: "acre" | "bigha" | "decimal";
  };
  soilType?: string;
  waterAvailability?: string;
  budgetBdt?: number;
  targetSeason?: string;
  currentCrop?: string;
}

export interface WeatherDaily {
  date: string;
  rainfallMm: number;
  temperatureMinC: number;
  temperatureMaxC: number;
}

export interface WeatherForecast {
  provider: "open-meteo" | "mock";
  locationText: string;
  latitude: number;
  longitude: number;
  daily: WeatherDaily[];
  raw: unknown;
}

export interface CropRecommendation {
  crop: string;
  suitabilityScore: number;
  waterNeed: "low" | "medium" | "high";
  riskLevel: "low" | "medium" | "high";
  expectedYieldKg: number;
  expectedRevenueBdt: number;
  totalCostBdt: number;
  netProfitBdt: number;
  roiPct: number;
  breakEvenYieldKg: number;
  factors: {
    soilFit: number;
    seasonFit: number;
    waterFit: number;
    tempFit: number;
    budgetFit: number;
  };
  reasoning: string;
  citations: string[];
}

export interface SeasonPlanTask {
  phase: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  quantity?: number;
  unit?: string;
  unitCostBdt?: number;
  totalCostBdt?: number;
  reasoning: string;
}

export interface SeasonPlanResult {
  id?: string;
  crop: string;
  sowDate: string;
  harvestStartDate: string;
  harvestEndDate: string;
  tasks: SeasonPlanTask[];
  financials: {
    expectedYieldKg: number;
    expectedRevenueBdt: number;
    totalCostBdt: number;
    netProfitBdt: number;
    roiPct: number;
    breakEvenYieldKg: number;
  };
  reasoning: string;
}

export interface TraceEvent {
  kind: "tool" | "plan" | "error";
  toolName: string;
  parameters: Record<string, unknown>;
  rawResponse?: unknown;
  status: "success" | "error";
  errorMessage?: string;
  latencyMs: number;
}

export interface AgriSenseMessageResult {
  sessionId: string;
  farmerId: string;
  farmId: string;
  assistantMessage: string;
  missingFields: string[];
  farmProfile: IntakeProfile;
  weather?: WeatherForecast;
  cropRankings?: CropRecommendation[];
  seasonPlan?: SeasonPlanResult;
  trace: TraceEvent[];
}

export function sendAgriSenseMessage(input: {
  message: string;
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  bdappsMobile?: string;
}): Promise<AgriSenseMessageResult> {
  return apiFetch<AgriSenseMessageResult>("/api/agrisense/message", {
    method: "POST",
    body: input,
  });
}

export function getAgriSenseTrace(sessionId: string): Promise<unknown[]> {
  return apiFetch<unknown[]>(`/api/agrisense/sessions/${sessionId}/trace`);
}

export function getAgriSensePlan(planId: string): Promise<unknown> {
  return apiFetch<unknown>(`/api/agrisense/plans/${planId}`);
}

