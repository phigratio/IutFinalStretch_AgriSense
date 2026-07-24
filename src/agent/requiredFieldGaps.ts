/**
 * Deterministic T0-1 gap checker. This is intentionally not delegated to the
 * model so the agent never re-asks fields that are already known.
 */
import { type IntakeField, type IntakeProfile } from "./intakeSchema.js";

export function requiredFieldGaps(profile: IntakeProfile): IntakeField[] {
  const gaps: IntakeField[] = [];

  if (!hasText(profile.locationText)) gaps.push("location");
  if (!hasPositiveNumber(profile.sizeAcres)) gaps.push("farmSize");
  if (!hasText(profile.soilType)) gaps.push("soilType");
  if (!hasText(profile.waterAvailability)) gaps.push("waterAvailability");
  if (!hasPositiveNumber(profile.budgetBdt)) gaps.push("budget");
  if (!hasText(profile.targetSeason)) gaps.push("targetSeason");

  return gaps;
}

export function mergeProfilePatch(profile: IntakeProfile, patch: Partial<IntakeProfile>): IntakeProfile {
  const merged = { ...profile } as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    merged[key] = typeof value === "string" ? value.trim() : value;
  }

  return normalizeProfile(merged as IntakeProfile);
}

export function normalizeProfile(profile: IntakeProfile): IntakeProfile {
  return {
    ...profile,
    locationText: normalizeText(profile.locationText),
    soilType: normalizeText(profile.soilType)?.toLowerCase(),
    waterAvailability: normalizeText(profile.waterAvailability)?.toLowerCase(),
    targetSeason: normalizeText(profile.targetSeason),
    currentCrop: normalizeText(profile.currentCrop)?.toLowerCase(),
    farmerName: normalizeText(profile.farmerName),
    preferredLanguage: normalizeText(profile.preferredLanguage),
    bdappsMobile: normalizeText(profile.bdappsMobile),
    sizeAcres: normalizePositiveNumber(profile.sizeAcres),
    budgetBdt: normalizePositiveNumber(profile.budgetBdt),
    latitude: normalizeNumber(profile.latitude),
    longitude: normalizeNumber(profile.longitude),
  };
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function hasPositiveNumber(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizePositiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
