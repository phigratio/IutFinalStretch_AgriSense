import { apiFetch } from "./client.js";

const tenantHeaders = (userId: string) => ({ "x-user-id": userId });

export interface KbDocumentRecord {
  tenantId: string;
  scope: "hub" | "tenant";
  docKey: string;
  title: string;
  source: string;
  sourceUrl?: string;
  page?: string;
  cropId?: string;
  mem0Ids: string[];
  dataOrigin: string;
  verificationStatus: "verified" | "cross_checked" | "unverified";
  retrievedAt?: string;
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
  verificationStatus: "verified" | "cross_checked" | "unverified";
}

export interface KbSearchResponse {
  tenantId: string;
  hits: KbHit[];
  citations: string[];
}

export interface KbIngestionJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  stage: string;
  originalName: string;
  title: string;
  source: string;
  verificationStatus: "verified" | "cross_checked" | "unverified";
  extractedChars: number;
  chunkCount: number;
  processedChunks: number;
  errorMessage?: string;
  createdAt: string;
}

export function uploadKbFiles(form: FormData) {
  return apiFetch<{ jobs: KbIngestionJob[] }>(`/api/hub/kb/uploads`, {
    method: "POST", body: form,
  });
}

export function listKbIngestionJobs() {
  return apiFetch<KbIngestionJob[]>(`/api/hub/kb/jobs`);
}

export function listHubDocuments() {
  return apiFetch<KbDocumentRecord[]>(`/api/hub/kb/docs`);
}

export function postTenantPrice(tenantId: string, userId: string, body: Record<string, unknown>) {
  return apiFetch(`/api/tenants/${encodeURIComponent(tenantId)}/prices`, {
    method: "POST", body, headers: tenantHeaders(userId),
  });
}

export function postTenantDocument(tenantId: string, userId: string, body: Record<string, unknown>) {
  return apiFetch(`/api/tenants/${encodeURIComponent(tenantId)}/kb/docs`, {
    method: "POST", body, headers: tenantHeaders(userId),
  });
}

export function listTenantDocuments(tenantId: string, userId: string) {
  return apiFetch<KbDocumentRecord[]>(`/api/tenants/${encodeURIComponent(tenantId)}/kb/docs`, {
    headers: tenantHeaders(userId),
  });
}

export function searchKnowledgeBase(
  tenantId: string,
  userId: string,
  params: { query: string; cropId?: string; includeUnverified?: boolean },
) {
  const qs = new URLSearchParams({ query: params.query, tenantId });
  if (params.cropId) qs.set("cropId", params.cropId);
  if (params.includeUnverified) qs.set("includeUnverified", "true");
  return apiFetch<KbSearchResponse>(`/api/kb/search?${qs.toString()}`, {
    headers: tenantHeaders(userId),
  });
}
