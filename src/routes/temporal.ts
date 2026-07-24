import { Router } from "express";
import { randomUUID } from "node:crypto";
import { createTemporalClient, temporalTaskQueue } from "../temporal/client.js";
import { ensureAgriSenseSchedules, describeAgriSenseSchedules } from "../temporal/schedules.js";
import { AGRISENSE_SCHEDULES } from "../temporal/types.js";

export const temporalRouter = Router();

temporalRouter.get("/schedules", async (_req, res, next) => {
  try {
    const client = await createTemporalClient();
    res.json({
      taskQueue: temporalTaskQueue(),
      schedules: await describeAgriSenseSchedules(client),
    });
  } catch (error) {
    next(error);
  }
});

temporalRouter.post("/schedules/ensure", async (_req, res, next) => {
  try {
    const client = await createTemporalClient();
    res.json(await ensureAgriSenseSchedules(client));
  } catch (error) {
    next(error);
  }
});

temporalRouter.post("/workflows/:workflowType/run", async (req, res, next) => {
  try {
    const workflowType = req.params.workflowType;
    const definition = AGRISENSE_SCHEDULES.find((item) => item.workflowType === workflowType);
    if (!definition) {
      res.status(404).json({
        error: "Unknown workflow",
        allowed: AGRISENSE_SCHEDULES.map((item) => item.workflowType),
      });
      return;
    }

    const client = await createTemporalClient();
    const handle = await client.workflow.start(definition.workflowType, {
      taskQueue: temporalTaskQueue(),
      workflowId: `${definition.workflowType}-manual-${randomUUID()}`,
      args: [Object.keys(req.body as Record<string, unknown>).length > 0 ? req.body : definition.args[0]],
    });

    res.status(202).json({
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      workflowType: definition.workflowType,
    });
  } catch (error) {
    next(error);
  }
});

temporalRouter.get("/workflows/:workflowId/result", async (req, res, next) => {
  try {
    const client = await createTemporalClient();
    const handle = client.workflow.getHandle(req.params.workflowId);
    res.json(await handle.result());
  } catch (error) {
    next(error);
  }
});
