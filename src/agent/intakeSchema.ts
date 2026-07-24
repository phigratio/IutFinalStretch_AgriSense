/**
 * Shared intake contracts for T0-1 conversational farm-profile collection.
 * The LLM may propose profile patches, but deterministic code owns gaps.
 */
export const REQUIRED_INTAKE_FIELDS = [
  "location",
  "farmSize",
  "soilType",
  "waterAvailability",
  "budget",
  "targetSeason",
] as const;

export type IntakeField = (typeof REQUIRED_INTAKE_FIELDS)[number];

export interface IntakeProfile {
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  farmerName?: string;
  bdappsMobile?: string;
  preferredLanguage?: "en" | "bn" | "banglish";
  locationText?: string;
  latitude?: number;
  longitude?: number;
  sizeAcres?: number;
  sizeOriginal?: {
    value: number;
    unit: "acre" | "bigha" | "decimal";
  };
  soilType?: string;
  waterAvailability?: string;
  budgetBdt?: number;
  targetSeason?: string;
  currentCrop?: string;
}

export interface IntakeProfilePatch extends Partial<Omit<IntakeProfile, "farmerId" | "farmId" | "sessionId">> {
  confidence?: number;
  notes?: string[];
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

export interface IntakeTurnResult {
  sessionId: string;
  farmerId: string;
  farmId: string;
  profile: IntakeProfile;
  missingFields: IntakeField[];
  intakeComplete: boolean;
  reply: string;
  trace: IntakeTraceEvent[];
  nextStep?: {
    name: "weather_and_crop_planning";
    plannedTools: string[];
  };
}

export interface IntakeRequest {
  message: string;
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  userId?: string;
  tenantId?: string;
  bdappsMobile?: string;
  channel?: string;
  preferredLanguage?: "en" | "bn" | "banglish";
}
