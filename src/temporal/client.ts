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
  const connection = await Connection.connect({ address: temporalAddress() });
  return new Client({
    connection,
    namespace: temporalNamespace(),
  });
}
