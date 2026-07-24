import { type Client } from "@temporalio/client";
import { AGRISENSE_SCHEDULES } from "./types.js";
import { temporalTaskQueue } from "./client.js";

export async function ensureAgriSenseSchedules(client: Client): Promise<{ created: string[]; existing: string[] }> {
  const created: string[] = [];
  const existing: string[] = [];

  for (const definition of AGRISENSE_SCHEDULES) {
    const handle = client.schedule.getHandle(definition.scheduleId);
    try {
      await handle.describe();
      existing.push(definition.scheduleId);
      continue;
    } catch {
      // Missing schedule; create it below.
    }

    await client.schedule.create({
      scheduleId: definition.scheduleId,
      spec: {
        cronExpressions: [definition.cronExpression],
      },
      action: {
        type: "startWorkflow",
        workflowType: definition.workflowType,
        taskQueue: temporalTaskQueue(),
        args: definition.args,
      },
      policies: {
        overlap: "SKIP",
      },
      state: {
        note: definition.description,
      },
    });
    created.push(definition.scheduleId);
  }

  return { created, existing };
}

export async function describeAgriSenseSchedules(client: Client): Promise<unknown[]> {
  const schedules: unknown[] = [];
  for (const definition of AGRISENSE_SCHEDULES) {
    try {
      const description = await client.schedule.getHandle(definition.scheduleId).describe();
      schedules.push({
        ...definition,
        exists: true,
        description,
      });
    } catch (error) {
      schedules.push({
        ...definition,
        exists: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return schedules;
}
