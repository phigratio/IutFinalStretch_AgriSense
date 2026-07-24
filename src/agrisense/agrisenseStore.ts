/**
 * AgriSense persistence for tool traces, weather snapshots, and season plans.
 * Postgres backs the demo; an in-memory store keeps engine tests fast.
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";
import { type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { type SeasonPlanResult, type WeatherForecast } from "./types.js";

export interface AgriSenseStore {
  saveTrace(sessionId: string, event: IntakeTraceEvent): Promise<void>;
  saveWeather(sessionId: string, farmId: string, weather: WeatherForecast): Promise<string[]>;
  saveSeasonPlan(sessionId: string, farmId: string, plan: SeasonPlanResult, weatherSnapshotIds: string[]): Promise<SeasonPlanResult>;
  listTrace(sessionId: string): Promise<unknown[]>;
  getPlan(planId: string): Promise<unknown | undefined>;
  close?(): Promise<void>;
}

export class InMemoryAgriSenseStore implements AgriSenseStore {
  readonly traces = new Map<string, IntakeTraceEvent[]>();
  readonly weather = new Map<string, WeatherForecast>();
  readonly plans = new Map<string, SeasonPlanResult>();

  async saveTrace(sessionId: string, event: IntakeTraceEvent): Promise<void> {
    const events = this.traces.get(sessionId) ?? [];
    events.push(event);
    this.traces.set(sessionId, events);
  }

  async saveWeather(_sessionId: string, _farmId: string, weather: WeatherForecast): Promise<string[]> {
    const ids = weather.daily.map(() => randomUUID());
    this.weather.set(ids[0]!, weather);
    return ids;
  }

  async saveSeasonPlan(_sessionId: string, _farmId: string, plan: SeasonPlanResult): Promise<SeasonPlanResult> {
    const saved = { ...plan, id: randomUUID() };
    this.plans.set(saved.id!, saved);
    return saved;
  }

  async listTrace(sessionId: string): Promise<unknown[]> {
    return this.traces.get(sessionId) ?? [];
  }

  async getPlan(planId: string): Promise<unknown | undefined> {
    return this.plans.get(planId);
  }
}

export class PostgresAgriSenseStore implements AgriSenseStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async saveTrace(sessionId: string, event: IntakeTraceEvent): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "agent_tool_calls" (
        "id", "session_id", "tool_name", "purpose", "parameters", "raw_response",
        "status", "error_message", "finished_at"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${sessionId}::uuid,
        ${event.toolName},
        ${event.kind},
        ${event.parameters as Prisma.InputJsonValue},
        ${event.rawResponse === undefined ? null : event.rawResponse as Prisma.InputJsonValue},
        ${event.status},
        ${event.errorMessage ?? null},
        CURRENT_TIMESTAMP
      )
    `;
  }

  async saveWeather(sessionId: string, farmId: string, weather: WeatherForecast): Promise<string[]> {
    const ids: string[] = [];
    for (const day of weather.daily) {
      const id = randomUUID();
      ids.push(id);
      await this.prisma.$executeRaw`
        INSERT INTO "weather_snapshots" (
          "id", "session_id", "farm_id", "provider", "location_text", "forecast_date",
          "rainfall_mm", "temperature_min_c", "temperature_max_c", "raw_response"
        )
        VALUES (
          ${id}::uuid,
          ${sessionId}::uuid,
          ${farmId}::uuid,
          ${weather.provider},
          ${weather.locationText},
          ${day.date}::date,
          ${day.rainfallMm},
          ${day.temperatureMinC},
          ${day.temperatureMaxC},
          ${weather.raw as Prisma.InputJsonValue}
        )
      `;
    }
    return ids;
  }

  async saveSeasonPlan(sessionId: string, farmId: string, plan: SeasonPlanResult, weatherSnapshotIds: string[]): Promise<SeasonPlanResult> {
    const planId = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "season_plans" (
        "id", "session_id", "farm_id", "crop", "rank", "suitability_score", "water_need",
        "risk_level", "reasoning", "retrieved_chunk_ids", "weather_snapshot_ids",
        "expected_yield_unit", "expected_yield", "expected_revenue_bdt", "total_cost_bdt",
        "net_profit_bdt", "roi_pct", "break_even_yield"
      )
      VALUES (
        ${planId}::uuid,
        ${sessionId}::uuid,
        ${farmId}::uuid,
        ${plan.crop},
        1,
        0,
        'computed',
        'computed',
        ${plan.reasoning},
        ARRAY[]::text[],
        ${weatherSnapshotIds},
        'kg',
        ${plan.financials.expectedYieldKg},
        ${plan.financials.expectedRevenueBdt},
        ${plan.financials.totalCostBdt},
        ${plan.financials.netProfitBdt},
        ${plan.financials.roiPct},
        ${plan.financials.breakEvenYieldKg}
      )
    `;

    for (const task of plan.tasks) {
      await this.prisma.$executeRaw`
        INSERT INTO "season_plan_items" (
          "id", "plan_id", "item_type", "title", "description", "start_date", "end_date",
          "quantity", "unit", "unit_cost_bdt", "total_cost_bdt", "reasoning"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${planId}::uuid,
          ${task.phase},
          ${task.title},
          ${task.description},
          ${task.startDate}::date,
          ${task.endDate}::date,
          ${task.quantity ?? null},
          ${task.unit ?? null},
          ${task.unitCostBdt ?? null},
          ${task.totalCostBdt ?? null},
          ${task.reasoning}
        )
      `;
    }

    return { ...plan, id: planId };
  }

  async listTrace(sessionId: string): Promise<unknown[]> {
    return this.prisma.$queryRaw`
      SELECT
        "id", "tool_name", "purpose", "parameters", "raw_response",
        "status", "error_message", "started_at", "finished_at"
      FROM "agent_tool_calls"
      WHERE "session_id" = ${sessionId}::uuid
      ORDER BY "started_at" ASC
    `;
  }

  async getPlan(planId: string): Promise<unknown | undefined> {
    const plans = await this.prisma.$queryRaw<unknown[]>`
      SELECT
        p.*,
        COALESCE(json_agg(i.* ORDER BY i."start_date") FILTER (WHERE i."id" IS NOT NULL), '[]') AS items
      FROM "season_plans" p
      LEFT JOIN "season_plan_items" i ON i."plan_id" = p."id"
      WHERE p."id" = ${planId}::uuid
      GROUP BY p."id"
      LIMIT 1
    `;
    return plans[0];
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

let defaultAgriSenseStore: AgriSenseStore | undefined;

export function getDefaultAgriSenseStore(): AgriSenseStore {
  defaultAgriSenseStore ??= config.databaseUrl
    ? new PostgresAgriSenseStore(config.databaseUrl)
    : new InMemoryAgriSenseStore();
  return defaultAgriSenseStore;
}

