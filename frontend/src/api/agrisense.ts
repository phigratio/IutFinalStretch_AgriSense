import { apiFetch } from "./client.js";

export interface IntakeProfile {
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  farmerName?: string;
  bdappsMobile?: string;
  preferredLanguage?: "en" | "bn" | "banglish";
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
  humidityPct?: number;
  referenceEvapotranspirationMm?: number;
  soilMoisture0To9cm?: number;
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
    evidenceFit?: number;
  };
  reasoning: string;
  citations: string[];
}

export interface RetrievedEvidence {
  id: string;
  source: "seeded-baseline" | "mem0" | "rag";
  title: string;
  content: string;
  citation?: string;
  crop?: string;
  metadata?: Record<string, unknown>;
}

export interface CostBreakdownItem {
  category: string;
  label: string;
  amountBdt: number;
  reasoning: string;
}

export interface SeasonPlanTask {
  phase: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  growthStage?: string;
  organicAlternative?: string;
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
    pricePerKgBdt: number;
    budgetBdt: number;
    budgetSurplusBdt: number;
    costBreakdown: CostBreakdownItem[];
  };
  reasoning: string;
  selectedCropReason: string;
  sourceTraceIds: string[];
  automationTrigger: string;
  retrievedEvidence: RetrievedEvidence[];
}

export interface TraceEvent {
  traceId?: string;
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
  workflowStage?: WorkflowStage;
  nextAvailableStages?: string[];
  assistantMessage: string;
  missingFields: string[];
  farmProfile: IntakeProfile;
  weather?: WeatherForecast;
  retrievedEvidence?: RetrievedEvidence[];
  cropRankings?: CropRecommendation[];
  seasonPlan?: SeasonPlanResult;
  trace: TraceEvent[];
}

export type WorkflowStage = "intake" | "weather" | "evidence" | "crop_ranking" | "season_plan" | "financials" | "full";

export function sendAgriSenseMessage(input: {
  message: string;
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  bdappsMobile?: string;
  preferredLanguage?: "en" | "bn" | "banglish";
  selectedCrop?: string;
  workflowStage?: WorkflowStage;
  triggerReason?: "intake_completed" | "profile_updated" | "weather_refreshed" | "crop_selected" | "user_requested_replan" | "daily_forecast_check";
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
