/**
 * Trace decorator (T0-8). Every tool call becomes exactly one trace event, mapping onto the
 * `agent_tool_calls` table. `withTrace` is storage-agnostic: pass any `TraceWriter` — an
 * in-memory one for tests, a Prisma-backed one in the app. This is what lets a judge match any
 * number in the answer back to a raw tool response.
 */

export type TraceStatus = "success" | "error";

export interface TraceEvent {
  /** Stable id for number provenance chips, e.g. "get_forecast_001". */
  stepId: string;
  sessionId?: string;
  toolName: string;
  /** Where the value is used downstream, e.g. "crop_ranking.weatherFit". */
  purpose?: string;
  parameters: unknown;
  rawResponse?: unknown;
  status: TraceStatus;
  errorMessage?: string;
  startedAt: Date;
  finishedAt: Date;
  /** Convenience for the UI. */
  durationMs: number;
}

export interface TraceMeta {
  sessionId?: string;
  toolName: string;
  purpose?: string;
  parameters?: unknown;
}

export interface TraceWriter {
  /** Assign a stable, human-readable step id for a tool. */
  nextStepId(toolName: string): string;
  write(event: TraceEvent): void | Promise<void>;
}

/** Collects events in memory; used in tests and as the default when no DB is wired. */
export class InMemoryTraceWriter implements TraceWriter {
  readonly events: TraceEvent[] = [];
  private counters = new Map<string, number>();

  nextStepId(toolName: string): string {
    const n = (this.counters.get(toolName) ?? 0) + 1;
    this.counters.set(toolName, n);
    return `${toolName}_${String(n).padStart(3, "0")}`;
  }

  write(event: TraceEvent): void {
    this.events.push(event);
  }

  /** Events whose numbers were used by a given downstream consumer. */
  byPurpose(purpose: string): TraceEvent[] {
    return this.events.filter((e) => e.purpose === purpose);
  }

  reset(): void {
    this.events.length = 0;
    this.counters.clear();
  }
}

/**
 * Run `fn`, recording one trace event whether it succeeds or throws, and return both the result
 * and the event (the event carries the `stepId` used for number provenance). On error the failed
 * call is still written (status="error") and the error re-thrown — the failure is always visible
 * in the trace (spec §2 failure policy, §6).
 */
export async function runTraced<T>(
  writer: TraceWriter,
  meta: TraceMeta,
  fn: () => T | Promise<T>,
): Promise<{ result: T; event: TraceEvent }> {
  const stepId = writer.nextStepId(meta.toolName);
  const startedAt = new Date();
  try {
    const result = await fn();
    const finishedAt = new Date();
    const event: TraceEvent = {
      stepId,
      sessionId: meta.sessionId,
      toolName: meta.toolName,
      purpose: meta.purpose,
      parameters: meta.parameters ?? {},
      rawResponse: result,
      status: "success",
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };
    await writer.write(event);
    return { result, event };
  } catch (err) {
    const finishedAt = new Date();
    await writer.write({
      stepId,
      sessionId: meta.sessionId,
      toolName: meta.toolName,
      purpose: meta.purpose,
      parameters: meta.parameters ?? {},
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    });
    throw err;
  }
}

/** Convenience wrapper returning just the result. */
export async function withTrace<T>(
  writer: TraceWriter,
  meta: TraceMeta,
  fn: () => T | Promise<T>,
): Promise<T> {
  return (await runTraced(writer, meta, fn)).result;
}
