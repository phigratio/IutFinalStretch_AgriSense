/**
 * Mirrored backend contracts — keep in sync with:
 *   src/agrisense/types.ts, src/agent/intakeSchema.ts (message flow, trace)
 *   src/payments/service.ts, src/payments/store.ts (checkout, receipts)
 * The app renders ONLY data from these responses; it invents no numbers.
 */

export interface IntakeProfile {
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  farmerName?: string;
  bdappsMobile?: string;
  preferredLanguage?: string;
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

export interface IntakeTraceEvent {
  kind: "tool" | "plan" | "error";
  toolName: string;
  parameters: Record<string, unknown>;
  rawResponse?: unknown;
  status: "success" | "error";
  errorMessage?: string;
  latencyMs: number;
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
  phase: "land-prep" | "sowing" | "fertilizer" | "irrigation" | "weed" | "pest-check" | "harvest";
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
  trace: IntakeTraceEvent[];
}

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
