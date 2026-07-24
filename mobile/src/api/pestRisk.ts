/**
 * Pest & disease risk client — mirrors frontend/src/api/pestRisk.ts. Weather-
 * grounded rule engine: crop + growth stage + live weather -> ranked risks with
 * prevention/treatment and cost. Update BOTH sides in one commit.
 */
import { apiFetch } from './client';
import type { TraceEvent, WeatherForecast } from './types';

export type PestSeverity = 'low' | 'medium' | 'high';

export interface PestRisk {
  ruleId: string;
  cropId: string;
  issueType: 'pest' | 'disease';
  issueName: string;
  severity: PestSeverity;
  score: number;
  matchedConditions: string[];
  unmatchedConditions: string[];
  symptoms: string;
  prevention: { text: string; estimatedCostBdt: number; estimatedCostBdtPerAcre: number };
  treatment: { text: string; estimatedCostBdt: number; estimatedCostBdtPerAcre: number };
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
  return apiFetch<PestRiskResult>('/api/pest-risk/assess', { method: 'POST', body: input });
}
