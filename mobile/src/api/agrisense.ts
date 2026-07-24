/**
 * Agent conversation API — wraps the backend agrisense routes:
 *   POST /api/agrisense/message              (one agent turn; supports staged runs)
 *   GET  /api/agrisense/sessions/:id/trace   (full persisted trace)
 *   GET  /api/agrisense/plans/:id            (plan readback)
 * Contract mirrors frontend/src/api/agrisense.ts. Consumed by session state,
 * chat, plan, and trace screens.
 */
import { apiFetch } from "./client";
import type { AgriSenseMessageResult, Language, WorkflowStage } from "./types";

export interface SendMessageInput {
  message: string;
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  bdappsMobile?: string;
  preferredLanguage?: Language;
  selectedCrop?: string;
  workflowStage?: WorkflowStage;
  triggerReason?:
    | "intake_completed"
    | "profile_updated"
    | "weather_refreshed"
    | "crop_selected"
    | "user_requested_replan"
    | "daily_forecast_check";
}

export function sendMessage(input: SendMessageInput): Promise<AgriSenseMessageResult> {
  return apiFetch<AgriSenseMessageResult>("/api/agrisense/message", {
    method: "POST",
    body: input,
  });
}

export function getSessionTrace(sessionId: string): Promise<unknown[]> {
  return apiFetch<unknown[]>(`/api/agrisense/sessions/${encodeURIComponent(sessionId)}/trace`);
}

export function getPlan(planId: string): Promise<unknown> {
  return apiFetch<unknown>(`/api/agrisense/plans/${encodeURIComponent(planId)}`);
}
