/**
 * Mirrored backend contracts for the mobile app — kept in lockstep with the
 * web frontend's api/*.ts (the source of truth) so both clients render the
 * same data from the same backend. Update BOTH sides in one commit.
 *   frontend/src/api/agrisense.ts   -> intake, weather, crops, plan, trace
 *   frontend/src/api/marketplace.ts -> supplier + price intelligence
 *   frontend/src/api/payments.ts    -> CaaS checkout + receipts
 * The app renders ONLY data from these responses; it invents no numbers.
 */

export type Language = "en" | "bn" | "banglish";

export type WorkflowStage =
  | "intake"
  | "weather"
  | "evidence"
  | "crop_ranking"
  | "season_plan"
  | "financials"
  | "full";

export interface IntakeProfile {
  sessionId?: string;
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  farmerName?: string;
  bdappsMobile?: string;
  preferredLanguage?: Language;
  locationText?: string;
  latitude?: number;
  longitude?: number;
  sizeAcres?: number;
  sizeOriginal?: { value: number; unit: "acre" | "bigha" | "decimal" };
  soilType?: string;
  waterAvailability?: string;
  budgetBdt?: number;
  targetSeason?: string;
  currentCrop?: string;
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

export interface SeasonPlanFinancials {
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
  financials: SeasonPlanFinancials;
  schedulerSummary?: SchedulerSummary;
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
  rememberedOutcomes?: MemoryOutcome[];
  memoryTrace?: TraceEvent[];
  trace: TraceEvent[];
}

// --- marketplace ---

export interface SupplierOffer {
  supplierId: string;
  supplierName: string;
  district: string;
  itemName: string;
  category: string;
  unit: string;
  unitPriceBdt: number;
  quantityAvailable: number;
  requestedQuantity: number;
  totalPriceBdt: number;
  deliveryDays: number;
  distanceKm: number;
  rating: number;
  score: number;
  rankReason: string;
}

export interface MarketPricePoint {
  crop: string;
  marketName: string;
  district: string;
  unit: string;
  observedAt: string;
  wholesalePriceBdt: number;
  farmgatePriceBdt: number;
}

export interface MarketplaceIntelligenceResult {
  agentMessage: string;
  needs: {
    itemName: string;
    quantity: number;
    unit: string;
    district?: string;
    latitude?: number;
    longitude?: number;
  };
  supplierOffers: SupplierOffer[];
  priceIntelligence: {
    crop: string;
    current?: MarketPricePoint;
    history: MarketPricePoint[];
    trendPct: number;
    recommendation: {
      action: "sell_now" | "store" | "wait";
      confidence: number;
      reasoning: string;
    };
  };
  memory: { status: "used" | "unavailable"; retrieved: unknown[]; error?: string };
  trace: TraceEvent[];
  seeded: true;
}

// --- payments (CaaS) ---

export interface CheckoutResult {
  ok: boolean;
  paymentId: string;
  status: "success" | "insufficient" | "failed";
  statusCode: string;
  statusDetail?: string;
  externalTrxId?: string;
  internalTrxId?: string;
  balanceBeforeBdt?: number;
  amountBdt: number;
  smsSent: boolean;
  mock: boolean;
}

export interface PaymentRecord {
  id: string;
  mobile: string;
  amountBdt: number;
  status: "pending" | "success" | "insufficient" | "failed";
  planId?: string;
  userId?: string;
  externalReference?: string;
  receiptNumber?: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: unknown;
  createdAt: string;
}
