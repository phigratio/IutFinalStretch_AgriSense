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

export interface TenantContext {
  id: string;
  slug: string;
  name: string;
  kind: string;
  role: "tenant_admin" | "hub_admin";
  jurisdictions: Array<{ district: string; upazila?: string }>;
}

export function getTenantContext() {
  return apiFetch<TenantContext>("/api/tenant/context");
}

export function uploadTenantKbFile(tenantId: string, userId: string, form: FormData) {
  return apiFetch<KbIngestionJob>(`/api/tenants/${encodeURIComponent(tenantId)}/kb/uploads`, {
    method: "POST", body: form, headers: tenantHeaders(userId),
  });
}

export function addTenantKbLink(tenantId: string, userId: string, body: { url: string; title?: string }) {
  return apiFetch<{ ok: true; docKey: string; title: string; chunks: number }>(`/api/tenants/${encodeURIComponent(tenantId)}/kb/links`, {
    method: "POST", body, headers: tenantHeaders(userId),
  });
}

export function listTenantKbJobs(tenantId: string, userId: string) {
  return apiFetch<KbIngestionJob[]>(`/api/tenants/${encodeURIComponent(tenantId)}/kb/jobs`, {
    headers: tenantHeaders(userId),
  });
}

export function uploadKbFiles(form: FormData) {
  return apiFetch<{ jobs: KbIngestionJob[] }>(`/api/hub/kb/uploads`, {
    method: "POST", body: form,
  });
}

export function listKbIngestionJobs() {
  return apiFetch<KbIngestionJob[]>(`/api/hub/kb/jobs`);
}

export function retryKbIngestionJob(jobId: string) {
  return apiFetch<{ ok: true }>(`/api/hub/kb/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
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
