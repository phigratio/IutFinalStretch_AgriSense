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
  schedulerSummary?: SchedulerSummary;
  reasoning: string;
  selectedCropReason: string;
  sourceTraceIds: string[];
  automationTrigger: string;
  retrievedEvidence: RetrievedEvidence[];
}

export interface ScenarioDeltas {
  rainfallPct?: number;
  budgetPct?: number;
  pricePct?: number;
  costPct?: number;
  yieldPct?: number;
}

export interface ScenarioSimulationResult {
  id?: string;
  sessionId?: string;
  farmId?: string;
  planId?: string;
  scenarioLabel: string;
  deltas: ScenarioDeltas;
  baseline: {
    farmProfile: IntakeProfile;
    weather: WeatherForecast;
    cropRankings: CropRecommendation[];
    seasonPlan: SeasonPlanResult;
  };
  scenario: {
    farmProfile: IntakeProfile;
    weather: WeatherForecast;
    cropRankings: CropRecommendation[];
    seasonPlan: SeasonPlanResult;
  };
  comparison: {
    revenueBdt: number;
    costBdt: number;
    netProfitBdt: number;
    roiPct: number;
    breakEvenYieldKg: number;
    irrigationEvents: number;
    rainfall7dMm: number;
    budgetSurplusBdt: number;
  };
  recommendation: string;
  trace: TraceEvent[];
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

export interface ContextMemoryItem {
  id: string;
  title: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface KbHit {
  text: string;
  score: number;
  docKey?: string;
  scope?: "hub" | "tenant";
  tenantId?: string;
  source?: string;
  page?: string;
  citation: string;
}

export interface ContextBundle {
  identity: {
    cacheKey: string;
    memoryUserId: string;
    userId?: string;
    tenantId?: string;
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    bdappsMobile?: string;
  };
  cache: {
    status: "hit" | "miss" | "refresh";
    ttlMs: number;
    retrievedAt: string;
  };
  profile?: IntakeProfile;
  profileSnapshot?: IntakeProfile;
  memory: {
    outcomes: MemoryOutcome[];
    sessions: MemorySessionSummary[];
    mem0: ContextMemoryItem[];
  };
  priorAnalyses: Array<{
    id: string;
    kind: string;
    title: string;
    summary: string;
    score: number;
    createdAt: string;
  }>;
  kbHits: KbHit[];
  trace: TraceEvent[];
  warnings: string[];
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
  rememberedOutcomes?: MemoryOutcome[];
  memoryTrace?: TraceEvent[];
  context?: ContextBundle;
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
  userId?: string;
  tenantId?: string;
  useMemory?: boolean;
  acceptedOutcomeIds?: string[];
  ignoredOutcomeIds?: string[];
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

export function getAgriSenseMemory(input: {
  userId?: string;
  farmerId?: string;
  farmId?: string;
  bdappsMobile?: string;
  limit?: number;
}): Promise<MemoryLookupResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<MemoryLookupResult>(`/api/agrisense/memory${query ? `?${query}` : ""}`);
}

export function getAgriSenseContext(input: {
  message?: string;
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  bdappsMobile?: string;
  language?: "en" | "bn" | "banglish";
  cropId?: string;
  refresh?: boolean;
  limit?: number;
}): Promise<ContextBundle> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<ContextBundle>(`/api/context${query ? `?${query}` : ""}`);
}

export function simulateAgriSenseScenario(input: {
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  planId?: string;
  userId?: string;
  tenantId?: string;
  selectedCrop?: string;
  preferredLanguage?: "en" | "bn" | "banglish";
  message?: string;
  deltas?: ScenarioDeltas;
  baseline?: AgriSenseMessageResult;
}): Promise<ScenarioSimulationResult> {
  return apiFetch<ScenarioSimulationResult>("/api/agrisense/scenarios/simulate", {
    method: "POST",
    body: input,
  });
}
