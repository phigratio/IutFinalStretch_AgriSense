/**
 * Agent conversation API — wraps the backend's agrisense routes:
 *   POST /api/agrisense/message              (one agent turn: intake -> weather -> plan)
 *   GET  /api/agrisense/sessions/:id/trace   (full persisted trace for the Trace tab)
 *   GET  /api/agrisense/plans/:id            (plan readback)
 * Consumed by: chat screen, trace tab, plan tab.
 */
import { apiFetch } from "./client";
import type { AgriSenseMessageResult, SeasonPlanResult } from "./types";

export interface SendMessageInput {
  message: string;
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  bdappsMobile?: string;
  useMemory?: boolean;
  acceptedOutcomeIds?: string[];
  ignoredOutcomeIds?: string[];
}

export function sendMessage(input: SendMessageInput): Promise<AgriSenseMessageResult> {
  return apiFetch<AgriSenseMessageResult>("/api/agrisense/message", {
    method: "POST",
    body: { ...input, channel: "mobile" },
  });
}

export function getSessionTrace(sessionId: string): Promise<unknown[]> {
  return apiFetch<unknown[]>(`/api/agrisense/sessions/${encodeURIComponent(sessionId)}/trace`);
}

export function getPlan(planId: string): Promise<SeasonPlanResult> {
  return apiFetch<SeasonPlanResult>(`/api/agrisense/plans/${encodeURIComponent(planId)}`);
}
