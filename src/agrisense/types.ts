/**
 * AgriSense core contracts for Tier-0 planning after intake is complete.
 * These are backend response shapes consumed by the API and future UI.
 */
import { type IntakeProfile, type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { type ContextBundle } from "../context/contextService.js";

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

export interface CostBreakdownItem {
  category: "land-prep" | "seed" | "fertilizer" | "irrigation" | "pest" | "labor" | "harvest" | "contingency";
  label: string;
  amountBdt: number;
  reasoning: string;
}

export interface FinancialProjection {
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

export interface SeasonPlanTask {
  phase: "land-prep" | "sowing" | "fertilizer" | "irrigation" | "weed" | "pest-check" | "harvest";
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  growthStage?: string;
  organicAlternative?: string;
  inputs?: Array<{
    item: string;
    quantity: number;
    unit: string;
    unitCostBdt?: number;
    totalCostBdt?: number;
  }>;
  source?: string;
  weatherNote?: string;
  delayRecommended?: boolean;
  quantity?: number;
  unit?: string;
  unitCostBdt?: number;
  totalCostBdt?: number;
  reasoning: string;
}

export interface SchedulerSummary {
  cropId?: string;
  fertilityClass: string;
  fertilitySource: string;
  totalFertilizerCostBdt: number;
  totalIrrigationCostBdt: number;
  fertilizerTotals: Record<string, number>;
  irrigationEvents: number;
  rainDelayWarnings: number;
  sources: string[];
}

export interface SeasonPlanResult {
  id?: string;
  crop: string;
  sowDate: string;
  harvestStartDate: string;
  harvestEndDate: string;
  tasks: SeasonPlanTask[];
  financials: FinancialProjection;
  schedulerSummary?: SchedulerSummary;
  reasoning: string;
  selectedCropReason: string;
  sourceTraceIds: string[];
  automationTrigger: string;
  retrievedEvidence: RetrievedEvidence[];
}

export type MemoryOutcomeKind =
  | "farm_fact"
  | "crop_decision"
  | "financial_result"
  | "risk_warning"
  | "pending_task"
  | "farmer_preference";

export interface MemoryOutcome {
  id: string;
  userId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  kind: MemoryOutcomeKind;
  title: string;
  summary: string;
  valueJson: Record<string, unknown>;
  score: number;
  sourceTraceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemorySessionSummary {
  id: string;
  status: string;
  channel: string;
  selectedCrop?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryLookupResult {
  outcomes: MemoryOutcome[];
  sessions: MemorySessionSummary[];
}

export interface AgriSenseMessageResult {
  sessionId: string;
  farmerId: string;
  farmId: string;
  workflowStage?: "intake" | "weather" | "evidence" | "crop_ranking" | "season_plan" | "financials" | "full";
  nextAvailableStages?: string[];
  assistantMessage: string;
  missingFields: string[];
  farmProfile: IntakeProfile;
  weather?: WeatherForecast;
  retrievedEvidence?: RetrievedEvidence[];
  cropRankings?: CropRecommendation[];
  seasonPlan?: SeasonPlanResult;
  rememberedOutcomes?: MemoryOutcome[];
  memoryTrace?: IntakeTraceEvent[];
  context?: ContextBundle;
  trace: IntakeTraceEvent[];
}
