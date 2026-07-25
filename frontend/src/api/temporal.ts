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
  /** false when the Temporal cluster is unreachable (schedules will be empty). */
  temporalAvailable?: boolean;
}

export interface TemporalEnsureResult {
  created: string[];
  existing: string[];
  temporalAvailable?: boolean;
}

export interface TemporalRunResult {
  workflowId: string;
  runId?: string;
  workflowType: string;
}

export interface ProactiveAlert {
  id: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  alertType: string;
  severity: "info" | "warning" | string;
  title: string;
  message: string;
  recommendation: string;
  ruleId: string;
  triggerDate?: string;
  rawEvidence?: {
    forecastDay?: {
      date: string;
      rainfallMm: number;
      temperatureMinC?: number;
      temperatureMaxC?: number;
    };
    location?: string;
    impactedTask?: {
      task_id: string;
      item_type: string;
      title: string;
      description: string;
      start_date?: string;
      end_date?: string;
      quantity?: number | string;
      unit?: string;
      reasoning?: string;
    } | null;
    adjustment?: {
      delayDays: number;
      adjustedStartDate: string;
      adjustedEndDate: string;
      rationale: string;
    };
  };
  fingerprint: string;
  status: string;
  createdAt: string;
  locationText?: string;
  currentCrop?: string;
  targetSeason?: string;
  planCrop?: string;
}

export interface TemporalJobRun {
  id: string;
  workflowType: string;
  workflowId?: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  summary?: {
    workflow?: string;
    scanned?: number;
    created?: number;
    skipped?: number;
    errors?: string[];
  };
  errorMessage?: string;
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

export function listProactiveAlerts(limit = 20): Promise<ProactiveAlert[]> {
  return apiFetch<ProactiveAlert[]>(`/api/temporal/alerts?limit=${limit}`);
}

export function listTemporalJobRuns(limit = 10): Promise<TemporalJobRun[]> {
  return apiFetch<TemporalJobRun[]>(`/api/temporal/job-runs?limit=${limit}`);
}
