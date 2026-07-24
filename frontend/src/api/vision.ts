import { apiFetch } from "./client.js";
import type { TraceEvent } from "./agrisense.js";

export type LeafSeverity = "none" | "low" | "medium" | "high";
export type LeafSource = "hf" | "openai" | "unavailable";

export interface LeafTreatment {
  text: string;
  estimatedCostBdt?: number;
  source: "kb" | "ai" | "none";
}

export interface LeafModelLabel {
  label: string;
  score: number;
}

export interface LeafDiagnosisResult {
  id?: string;
  source: LeafSource;
  crop: string;
  cropId?: string;
  disease: string;
  healthy: boolean;
  confidence: number;
  severity: LeafSeverity;
  symptoms?: string;
  differentials: string[];
  treatment: LeafTreatment;
  prevention: LeafTreatment;
  citation?: string;
  caution?: string;
  modelLabels: LeafModelLabel[];
  imageUrl?: string;
  weatherNote?: string;
  decisionReason: string;
  context: {
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    planId?: string;
    cropContext?: string;
    locationText?: string;
    areaAcres?: number;
  };
  trace: TraceEvent[];
}

export interface LeafDiagnosisRecord extends LeafDiagnosisResult {
  createdAt: string;
}

export function diagnoseLeaf(input: {
  file: File;
  farmId?: string;
  planId?: string;
  sessionId?: string;
  crop?: string;
  locationText?: string;
  areaAcres?: number;
  language?: string;
  save?: boolean;
  createAlerts?: boolean;
}): Promise<LeafDiagnosisResult> {
  const form = new FormData();
  form.append("image", input.file);
  const optional: Record<string, string | number | boolean | undefined> = {
    farmId: input.farmId,
    planId: input.planId,
    sessionId: input.sessionId,
    crop: input.crop,
    locationText: input.locationText,
    areaAcres: input.areaAcres,
    language: input.language,
    save: input.save,
    createAlerts: input.createAlerts,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined && value !== "") form.append(key, String(value));
  }
  return apiFetch<LeafDiagnosisResult>("/api/vision/diagnose", { method: "POST", body: form });
}

export function listLeafDiagnoses(input: { farmId?: string; limit?: number } = {}): Promise<LeafDiagnosisRecord[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<LeafDiagnosisRecord[]>(`/api/vision/diagnoses${query ? `?${query}` : ""}`);
}
