import { apiFetch } from "./client.js";
import type { IntakeProfile, TraceEvent } from "./agrisense.js";

export interface AgentIntakeResult {
  sessionId: string;
  farmerId: string;
  farmId: string;
  profile: IntakeProfile;
  missingFields: string[];
  intakeComplete: boolean;
  reply: string;
  trace: TraceEvent[];
  nextStep?: {
    name: "weather_and_crop_planning";
    plannedTools: string[];
  };
}

export function runAgentIntake(input: {
  message: string;
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  userId?: string;
  tenantId?: string;
  bdappsMobile?: string;
  preferredLanguage?: "en" | "bn" | "banglish";
}): Promise<AgentIntakeResult> {
  return apiFetch<AgentIntakeResult>("/api/agent/intake", {
    method: "POST",
    body: { ...input, channel: "web" },
  });
}
