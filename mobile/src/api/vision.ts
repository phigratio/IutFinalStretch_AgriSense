/**
 * Leaf disease detection client (Tier-2 T2-4) — mirrors frontend/src/api/vision.ts.
 * Uploads a leaf photo (multipart) to POST /api/vision/diagnose. Uses a raw fetch
 * instead of the JSON apiFetch wrapper because this endpoint is multipart. On web
 * the image is a File; on native it is a {uri,name,type} part.
 */
import { apiBaseUrl } from "./config";
import { getToken } from "./tokenStore";
import { ApiError } from "./client";
import type { TraceEvent } from "./types";

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

/** A cross-platform multipart file part: a web File/Blob, or a native RN file object. */
export type LeafImagePart = Blob | { uri: string; name: string; type: string };

export async function diagnoseLeaf(input: {
  image: LeafImagePart;
  farmId?: string;
  sessionId?: string;
  crop?: string;
  locationText?: string;
  areaAcres?: number;
  language?: string;
  save?: boolean;
  createAlerts?: boolean;
}): Promise<LeafDiagnosisResult> {
  const form = new FormData();
  // RN accepts a {uri,name,type} object here; web accepts a File/Blob. Both work at runtime.
  form.append("image", input.image as unknown as Blob);
  const fields: Record<string, string | number | boolean | undefined> = {
    farmId: input.farmId,
    sessionId: input.sessionId,
    crop: input.crop,
    locationText: input.locationText,
    areaAcres: input.areaAcres,
    language: input.language,
    save: input.save,
    createAlerts: input.createAlerts,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") form.append(key, String(value));
  }

  const token = getToken();
  // Do NOT set Content-Type — the runtime adds the multipart boundary itself.
  const res = await fetch(`${apiBaseUrl()}/api/vision/diagnose`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const text = await res.text();
  const body: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message = (body as { error?: string } | undefined)?.error ?? `${res.status} from /api/vision/diagnose`;
    throw new ApiError(message, res.status, body);
  }
  return body as LeafDiagnosisResult;
}
