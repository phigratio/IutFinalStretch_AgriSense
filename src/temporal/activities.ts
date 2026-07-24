import { activityInfo } from "@temporalio/activity";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { mem0Client } from "../rag/mem0Client.js";
import { getWeatherForecast } from "../agrisense/weatherTool.js";
import type { MemoryRefreshInput, PlanReminderInput, SweepResult, WeatherAlertInput } from "./types.js";

interface ActiveFarmRow {
  farm_id: string;
  session_id: string | null;
  plan_id: string | null;
  location_text: string | null;
  preferred_language: string | null;
  current_crop: string | null;
  target_season: string | null;
  soil_type: string | null;
  water_availability: string | null;
}

interface DueTaskRow {
  task_id: string;
  plan_id: string;
  farm_id: string;
  session_id: string | null;
  crop: string;
  item_type: string;
  title: string;
  description: string;
  start_date: Date;
  end_date: Date | null;
}

export async function weatherAlertSweepActivity(input: WeatherAlertInput = {}): Promise<SweepResult> {
  return withPrisma("weather_alert_sweep", async (prisma) => {
    const rows = await listActiveFarms(prisma, input.maxFarms ?? 50);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.location_text) {
        skipped++;
        continue;
      }

      try {
        const forecast = await getWeatherForecast(row.location_text);
        const lookahead = Math.max(input.lookaheadDays ?? 5, 1);
        const threshold = input.rainfallThresholdMm ?? 20;
        const heavyRainDay = forecast.daily.slice(0, lookahead).find((day) => day.rainfallMm >= threshold);
        if (!heavyRainDay) {
          skipped++;
          continue;
        }

        created += await insertAlert(prisma, {
          farmId: row.farm_id,
          sessionId: row.session_id,
          planId: row.plan_id,
          alertType: "heavy_rain",
          severity: heavyRainDay.rainfallMm >= threshold * 1.5 ? "warning" : "info",
          title: "Heavy rain risk",
          message: `${heavyRainDay.rainfallMm}mm rain is forecast on ${heavyRainDay.date}.`,
          recommendation: "Delay fertilizer or sowing tasks until after the heavy-rain window.",
          ruleId: "weather.heavy_rain.lookahead",
          triggerDate: heavyRainDay.date,
          rawEvidence: { forecastDay: heavyRainDay, location: forecast.locationText },
          fingerprint: `weather:${row.farm_id}:${heavyRainDay.date}:${threshold}`,
        });
      } catch (error) {
        errors.push(`${row.farm_id}: ${(error as Error).message}`);
      }
    }

    return { workflow: "weather_alert_sweep", scanned: rows.length, created, skipped, errors };
  });
}

export async function planTaskReminderSweepActivity(input: PlanReminderInput = {}): Promise<SweepResult> {
  return withPrisma("plan_task_reminder_sweep", async (prisma) => {
    const lookahead = Math.max(input.lookaheadDays ?? 3, 1);
    const rows = await prisma.$queryRaw<DueTaskRow[]>`
      SELECT
        i."id" AS "task_id",
        i."plan_id",
        p."farm_id",
        p."session_id",
        p."crop",
        i."item_type",
        i."title",
        i."description",
        i."start_date",
        i."end_date"
      FROM "season_plan_items" i
      JOIN "season_plans" p ON p."id" = i."plan_id"
      WHERE i."start_date" BETWEEN CURRENT_DATE AND CURRENT_DATE + (${lookahead}::int * INTERVAL '1 day')
      ORDER BY i."start_date" ASC
      LIMIT ${input.maxTasks ?? 100}
    `;

    let created = 0;
    for (const row of rows) {
      created += await insertAlert(prisma, {
        farmId: row.farm_id,
        sessionId: row.session_id,
        planId: row.plan_id,
        alertType: "plan_task_due",
        severity: "info",
        title: row.title,
        message: `${row.item_type} task for ${row.crop} starts on ${toDateString(row.start_date)}.`,
        recommendation: row.description,
        ruleId: "season_plan.task_due.lookahead",
        triggerDate: toDateString(row.start_date),
        rawEvidence: { task: row },
        fingerprint: `task:${row.task_id}:${toDateString(row.start_date)}`,
      });
    }

    return { workflow: "plan_task_reminder_sweep", scanned: rows.length, created, skipped: 0, errors: [] };
  });
}

export async function memoryRefreshSweepActivity(input: MemoryRefreshInput = {}): Promise<SweepResult> {
  return withPrisma("memory_refresh_sweep", async (prisma) => {
    const rows = await listActiveFarms(prisma, input.maxFarms ?? 50);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!config.mem0PersistenceEnabled) {
        skipped++;
        continue;
      }
      try {
        await mem0Client.add({
          userId: row.farm_id,
          agentId: "agrisense-memory-refresh",
          runId: row.session_id ?? undefined,
          infer: false,
          messages: [
            {
              role: "system",
              content: `Farm memory refresh: ${row.location_text ?? "unknown location"}, ${row.soil_type ?? "unknown soil"}, ${row.water_availability ?? "unknown water"}, ${row.target_season ?? "unknown season"}, current crop ${row.current_crop ?? "not selected"}.`,
            },
          ],
          metadata: {
            farmId: row.farm_id,
            sessionId: row.session_id,
            planId: row.plan_id,
            source: "temporal-memory-refresh",
          },
        });
        created++;
      } catch (error) {
        errors.push(`${row.farm_id}: ${(error as Error).message}`);
      }
    }

    return { workflow: "memory_refresh_sweep", scanned: rows.length, created, skipped, errors };
  });
}

async function withPrisma(workflow: string, fn: (prisma: PrismaClient) => Promise<SweepResult>): Promise<SweepResult> {
  if (!config.databaseUrl) {
    return { workflow, scanned: 0, created: 0, skipped: 0, errors: ["DATABASE_URL is not configured"] };
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: config.databaseUrl }),
  });
  const startedAt = new Date();
  let jobRunId: string | null = null;

  try {
    jobRunId = await insertJobRun(prisma, {
      workflow,
      status: "running",
      startedAt,
      summary: {},
    });

    const result = await fn(prisma);
    await finishJobRun(prisma, {
      id: jobRunId,
      status: result.errors.length > 0 ? "completed_with_errors" : "completed",
      summary: result,
      errorMessage: result.errors.length > 0 ? result.errors.join("; ") : null,
    });
    return result;
  } catch (error) {
    if (jobRunId) {
      await finishJobRun(prisma, {
        id: jobRunId,
        status: "failed",
        summary: { workflow, error: (error as Error).message },
        errorMessage: (error as Error).message,
      });
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function insertJobRun(
  prisma: PrismaClient,
  input: {
    workflow: string;
    status: string;
    startedAt: Date;
    summary: unknown;
  },
): Promise<string> {
  const info = safeActivityInfo();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "temporal_job_runs" (
      "workflow_type", "workflow_id", "status", "started_at", "summary"
    )
    VALUES (
      ${input.workflow},
      ${info?.workflowExecution?.workflowId ?? null},
      ${input.status},
      ${input.startedAt},
      ${JSON.stringify(input.summary)}::jsonb
    )
    RETURNING "id"
  `;
  return rows[0]?.id;
}

async function finishJobRun(
  prisma: PrismaClient,
  input: {
    id: string;
    status: string;
    summary: unknown;
    errorMessage: string | null;
  },
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "temporal_job_runs"
    SET
      "status" = ${input.status},
      "finished_at" = now(),
      "summary" = ${JSON.stringify(input.summary)}::jsonb,
      "error_message" = ${input.errorMessage}
    WHERE "id" = ${input.id}::uuid
  `;
}

function safeActivityInfo(): ReturnType<typeof activityInfo> | null {
  try {
    return activityInfo();
  } catch {
    return null;
  }
}

async function listActiveFarms(prisma: PrismaClient, limit: number): Promise<ActiveFarmRow[]> {
  return prisma.$queryRaw<ActiveFarmRow[]>`
    SELECT
      f."id" AS "farm_id",
      s."id" AS "session_id",
      p."id" AS "plan_id",
      f."location_text",
      fp."preferred_language",
      f."current_crop",
      f."target_season",
      f."soil_type",
      f."water_availability"
    FROM "farm_profiles" f
    JOIN "farmer_profiles" fp ON fp."id" = f."farmer_id"
    LEFT JOIN LATERAL (
      SELECT * FROM "agent_sessions"
      WHERE "farm_id" = f."id"
      ORDER BY "updated_at" DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT * FROM "season_plans"
      WHERE "farm_id" = f."id"
      ORDER BY "updated_at" DESC
      LIMIT 1
    ) p ON true
    WHERE f."location_text" IS NOT NULL
    ORDER BY f."updated_at" DESC
    LIMIT ${limit}
  `;
}

async function insertAlert(
  prisma: PrismaClient,
  input: {
    farmId: string;
    sessionId: string | null;
    planId: string | null;
    alertType: string;
    severity: string;
    title: string;
    message: string;
    recommendation: string;
    ruleId: string;
    triggerDate: string;
    rawEvidence: unknown;
    fingerprint: string;
  },
): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO "proactive_alerts" (
      "farm_id", "session_id", "plan_id", "alert_type", "severity", "title",
      "message", "recommendation", "rule_id", "trigger_date", "raw_evidence", "fingerprint"
    )
    VALUES (
      ${input.farmId}::uuid,
      ${input.sessionId}::uuid,
      ${input.planId}::uuid,
      ${input.alertType},
      ${input.severity},
      ${input.title},
      ${input.message},
      ${input.recommendation},
      ${input.ruleId},
      ${input.triggerDate}::date,
      ${JSON.stringify(input.rawEvidence)}::jsonb,
      ${input.fingerprint}
    )
    ON CONFLICT ("fingerprint") DO NOTHING
  `;
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}
