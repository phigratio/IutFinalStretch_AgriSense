import { randomUUID } from "node:crypto";
import { InMemoryTraceWriter } from "../tools/trace.js";
import type { IntakeState } from "./intake.js";
import type { OrchestratorResult } from "./orchestrator.js";

/**
 * Minimal in-memory session store for the agent turn loop. Mirrors the repo's InMemory / Postgres
 * store pattern — a Prisma-backed `AgentSession` store can implement the same shape later. Holds
 * the running intake state and the session's trace writer so every turn appends to one trace.
 */
export interface AgentSessionState {
  id: string;
  state: IntakeState;
  writer: InMemoryTraceWriter;
  result?: OrchestratorResult;
  status: "intake" | "complete";
}

export interface AgentSessionStore {
  getOrCreate(sessionId?: string): AgentSessionState;
  get(sessionId: string): AgentSessionState | undefined;
  reset(): void;
}

export class InMemoryAgentSessionStore implements AgentSessionStore {
  private sessions = new Map<string, AgentSessionState>();

  getOrCreate(sessionId?: string): AgentSessionState {
    if (sessionId) {
      const existing = this.sessions.get(sessionId);
      if (existing) return existing;
    }
    const id = sessionId ?? randomUUID();
    const session: AgentSessionState = {
      id,
      state: {},
      writer: new InMemoryTraceWriter(),
      status: "intake",
    };
    this.sessions.set(id, session);
    return session;
  }

  get(sessionId: string): AgentSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  reset(): void {
    this.sessions.clear();
  }
}

let defaultStore: AgentSessionStore | undefined;
export function getDefaultAgentStore(): AgentSessionStore {
  defaultStore ??= new InMemoryAgentSessionStore();
  return defaultStore;
}
