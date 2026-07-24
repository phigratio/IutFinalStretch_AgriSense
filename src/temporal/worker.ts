import path from "node:path";
import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities.js";
import { temporalAddress, temporalNamespace, temporalTaskQueue, createTemporalClient } from "./client.js";
import { ensureAgriSenseSchedules } from "./schedules.js";

const workflowsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "workflows.js");

const connection = await NativeConnection.connect({
  address: temporalAddress(),
});

if (process.env.TEMPORAL_ENSURE_SCHEDULES !== "false") {
  const client = await createTemporalClient();
  const result = await ensureAgriSenseSchedules(client);
  console.log("Temporal schedules ready", result);
}

const worker = await Worker.create({
  connection,
  namespace: temporalNamespace(),
  taskQueue: temporalTaskQueue(),
  workflowsPath,
  activities,
});

console.log(`Temporal worker listening on task queue ${temporalTaskQueue()}`);
await worker.run();
