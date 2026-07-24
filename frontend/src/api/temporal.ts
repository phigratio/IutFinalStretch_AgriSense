import { apiFetch } from "./client.js";

export interface TemporalSchedule {
  scheduleId: string;
  workflowType: string;
  description?: unknown;
  cronExpression: string;
  exists?: boolean;
  args?: unknown[];
}

export interface TemporalSchedulesResult {
  taskQueue: string;
  schedules: TemporalSchedule[];
}

export interface TemporalEnsureResult {
  created: string[];
  existing: string[];
}

export interface TemporalRunResult {
  workflowId: string;
  runId?: string;
  workflowType: string;
}

export function listTemporalSchedules(): Promise<TemporalSchedulesResult> {
  return apiFetch<TemporalSchedulesResult>("/api/temporal/schedules");
}

export function ensureTemporalSchedules(): Promise<TemporalEnsureResult> {
  return apiFetch<TemporalEnsureResult>("/api/temporal/schedules/ensure", { method: "POST", body: {} });
}

export function runTemporalWorkflow(workflowType: string, input: Record<string, unknown> = {}): Promise<TemporalRunResult> {
  return apiFetch<TemporalRunResult>(`/api/temporal/workflows/${workflowType}/run`, {
    method: "POST",
    body: input,
  });
}

export function getTemporalWorkflowResult(workflowId: string): Promise<unknown> {
  return apiFetch<unknown>(`/api/temporal/workflows/${workflowId}/result`);
}
