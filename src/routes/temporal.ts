import { Router } from "express";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Client } from "@temporalio/client";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { createTemporalClient, temporalTaskQueue } from "../temporal/client.js";
import { ensureAgriSenseSchedules, describeAgriSenseSchedules } from "../temporal/schedules.js";
import { AGRISENSE_SCHEDULES } from "../temporal/types.js";

export const temporalRouter = Router();

/**
 * Connect to Temporal, or null when the cluster is unreachable. Read endpoints
 * degrade to an "offline" state so the admin page renders instead of 500ing when
 * Temporal isn't running (it's an optional dependency for the proactive-alert cron).
 */
async function tryTemporalClient(): Promise<Client | null> {
  try {
    return await createTemporalClient();
  } catch (error) {
    console.warn(`Temporal unavailable: ${(error as Error).message}`);
    return null;
  }
}

temporalRouter.get("/schedules", async (_req, res, next) => {
  try {
    const client = await tryTemporalClient();
    if (!client) {
      res.json({ taskQueue: temporalTaskQueue(), schedules: [], temporalAvailable: false });
      return;
    }
    res.json({
      taskQueue: temporalTaskQueue(),
      schedules: await describeAgriSenseSchedules(client),
      temporalAvailable: true,
    });
  } catch (error) {
    next(error);
  }
});

temporalRouter.post("/schedules/ensure", async (_req, res, next) => {
  try {
    const client = await tryTemporalClient();
    if (!client) {
      res.json({ created: [], existing: [], temporalAvailable: false });
      return;
    }
    res.json({ ...(await ensureAgriSenseSchedules(client)), temporalAvailable: true });
  } catch (error) {
    next(error);
  }
});

temporalRouter.get("/alerts", async (req, res, next) => {
  try {
    res.json(await withPrisma(async (prisma) => {
      const limit = positiveInt(req.query.limit, 20);
      return prisma.$queryRaw`
        SELECT
          a."id",
          a."farm_id" AS "farmId",
          a."session_id" AS "sessionId",
          a."plan_id" AS "planId",
          a."alert_type" AS "alertType",
          a."severity",
          a."title",
          a."message",
          a."recommendation",
          a."rule_id" AS "ruleId",
          a."trigger_date" AS "triggerDate",
          a."raw_evidence" AS "rawEvidence",
          a."fingerprint",
          a."status",
          a."created_at" AS "createdAt",
          f."location_text" AS "locationText",
          f."current_crop" AS "currentCrop",
          f."target_season" AS "targetSeason",
          p."crop" AS "planCrop"
        FROM "proactive_alerts" a
        LEFT JOIN "farm_profiles" f ON f."id" = a."farm_id"
        LEFT JOIN "season_plans" p ON p."id" = a."plan_id"
        ORDER BY a."created_at" DESC
        LIMIT ${limit}
      `;
    }));
  } catch (error) {
    next(error);
  }
});

temporalRouter.get("/job-runs", async (req, res, next) => {
  try {
    res.json(await withPrisma(async (prisma) => {
      const limit = positiveInt(req.query.limit, 10);
      return prisma.$queryRaw`
        SELECT
          "id",
          "workflow_type" AS "workflowType",
          "workflow_id" AS "workflowId",
          "status",
          "started_at" AS "startedAt",
          "finished_at" AS "finishedAt",
          "summary",
          "error_message" AS "errorMessage"
        FROM "temporal_job_runs"
        ORDER BY "started_at" DESC
        LIMIT ${limit}
      `;
    }));
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

    const client = await tryTemporalClient();
    if (!client) {
      res.status(503).json({ error: "Temporal scheduler is offline", temporalAvailable: false });
      return;
    }
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
    const client = await tryTemporalClient();
    if (!client) {
      res.status(503).json({ error: "Temporal scheduler is offline", temporalAvailable: false });
      return;
    }
    const handle = client.workflow.getHandle(req.params.workflowId);
    res.json(await handle.result());
  } catch (error) {
    next(error);
  }
});

async function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not configured");
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.databaseUrl }),
  });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

function positiveInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 100 ? parsed : fallback;
}
