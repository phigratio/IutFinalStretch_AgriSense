import { Client, Connection } from "@temporalio/client";
import { AGRISENSE_TASK_QUEUE } from "./types.js";

export function temporalAddress(): string {
  return process.env.TEMPORAL_ADDRESS ?? "temporal:7233";
}

export function temporalNamespace(): string {
  return process.env.TEMPORAL_NAMESPACE ?? "default";
}

export function temporalTaskQueue(): string {
  return process.env.TEMPORAL_TASK_QUEUE ?? AGRISENSE_TASK_QUEUE;
}

export async function createTemporalClient(): Promise<Client> {
  // Bounded connect so a down/unreachable Temporal server fails fast instead of
  // hanging the HTTP request; callers degrade gracefully on the thrown error.
  const connection = await Connection.connect({
    address: temporalAddress(),
    connectTimeout: "5s",
  });
  return new Client({
    connection,
    namespace: temporalNamespace(),
  });
}
