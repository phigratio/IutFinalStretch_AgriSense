import { apiFetch } from "./client.js";

export type UserRole = "user" | "tenant" | "admin";

export interface OnboardingProfile {
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
}

export interface OnboardingMe {
  role: UserRole;
  onboarding: OnboardingProfile | null;
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
