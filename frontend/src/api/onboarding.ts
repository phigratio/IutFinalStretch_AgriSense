import { apiFetch } from "./client.js";

export type UserRole = "user" | "tenant" | "admin";

export interface OnboardingProfile {
  id?: string;
  userId?: string;
  district: string;
  fullName?: string;
  phone?: string;
  upazila?: string;
  farmSizeDecimals?: number;
  soilTexture?: string;
  waterAvailability?: string;
  budgetBdt?: number;
  targetSeason?: string;
  filledBy?: "self" | "tenant";
  filledByUserId?: string;
  status?: "draft" | "submitted";
  updatedAt?: string;
}

export interface TenantRequest {
  id: string;
  userId: string;
  orgName: string;
  district: string;
  upazila?: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface AssistRequest {
  id: string;
  userId: string;
  fullName?: string;
  phone?: string;
  district: string;
  upazila?: string;
  note?: string;
  status: "pending" | "claimed" | "fulfilled" | "cancelled";
  createdAt: string;
}

export interface OnboardingMe {
  role: UserRole;
  onboarding: OnboardingProfile | null;
  profileComplete: boolean;
  missingFields: Array<keyof Pick<OnboardingProfile, "fullName" | "phone" | "district" | "farmSizeDecimals" | "soilTexture" | "waterAvailability" | "budgetBdt" | "targetSeason">>;
  tenantRequest: TenantRequest | null;
  assistRequest: AssistRequest | null;
}

export function getOnboardingMe(): Promise<OnboardingMe> {
  return apiFetch<OnboardingMe>("/api/onboarding/me");
}

export interface TenantRequestInput {
  orgName: string;
  district: string;
  upazila?: string;
  note?: string;
}
export function requestTenant(body: TenantRequestInput): Promise<{ id: string; status: string }> {
  return apiFetch("/api/onboarding/tenant-request", { method: "POST", body });
}

export function saveOwnProfile(body: OnboardingProfile): Promise<OnboardingProfile> {
  return apiFetch("/api/onboarding/profile", { method: "POST", body });
}

export interface AssistRequestInput {
  district: string;
  fullName?: string;
  phone?: string;
  upazila?: string;
  note?: string;
}
export function requestAssist(body: AssistRequestInput): Promise<{ id: string; status: string }> {
  return apiFetch("/api/onboarding/assist-request", { method: "POST", body });
}

export function listTenantRequests(status: TenantRequest["status"] = "pending"): Promise<TenantRequest[]> {
  return apiFetch(`/api/admin/tenant-requests?status=${status}`);
}

export function approveTenantRequest(id: string): Promise<{ ok: true; tenantSlug: string; request: TenantRequest }> {
  return apiFetch(`/api/admin/tenant-requests/${id}/approve`, { method: "POST" });
}

export function rejectTenantRequest(id: string): Promise<{ ok: true; request: TenantRequest }> {
  return apiFetch(`/api/admin/tenant-requests/${id}/reject`, { method: "POST" });
}

export function listAssistRequests(): Promise<AssistRequest[]> {
  return apiFetch("/api/tenant/assist-requests");
}

export function fulfillAssistRequest(id: string, body: OnboardingProfile): Promise<{ ok: true; onboarding: OnboardingProfile }> {
  return apiFetch(`/api/tenant/assist-requests/${id}/fulfill`, { method: "POST", body });
}
