/**
 * AgriSense core contracts for Tier-0 planning after intake is complete.
 * These are backend response shapes consumed by the API and future UI.
 */
import { type IntakeProfile, type IntakeTraceEvent } from "../agent/intakeSchema.js";

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

