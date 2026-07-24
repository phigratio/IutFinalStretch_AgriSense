import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { getWeatherForecast, mockWeatherForecast } from "../agrisense/weatherTool.js";
import type { IntakeTraceEvent, IntakeProfile } from "../agent/intakeSchema.js";
import type { WeatherForecast } from "../agrisense/types.js";
import {
  assessPestDiseaseRisk,
  resolvePestCropId,
  type PestRisk,
  type PestRiskAssessment,
  type PestSeverity,
} from "./pestRiskEngine.js";
import type { CropId } from "../data/crops.js";

export interface PestWeatherProvider {
  get(locationText: string): Promise<WeatherForecast>;
}

export interface PestRiskAssessInput {
  cropId?: CropId | string;
  crop?: string;
  growthStage?: string;
  daysAfterSowing?: number;
  areaAcres?: number;
  locationText?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  save?: boolean;
  createAlerts?: boolean;
}

export interface PestContext {
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  crop?: string;
  targetSeason?: string;
  currentCrop?: string;
  locationText?: string;
  areaAcres?: number;
  sowDate?: string;
}

export interface PestAssessmentRecord {
  id: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  cropId: string;
  cropLabel: string;
  growthStage: string;
  daysAfterSowing?: number;
  locationText: string;
  areaAcres: number;
  highestSeverity: PestSeverity;
  risks: PestRisk[];
  weather: WeatherForecast;
  trace: IntakeTraceEvent[];
  sourceTraceIds: string[];
  createdAt: string;
}

export interface PestRiskAssessResult {
  assessment: PestRiskAssessment & { id?: string };
  weather: WeatherForecast;
  trace: IntakeTraceEvent[];
  alertsCreated: number;
  savedAssessmentId?: string;
  context: PestContext;
}

export interface PestRiskStore {
  loadContext(input: PestRiskAssessInput): Promise<PestContext>;
  saveAssessment(input: {
    context: PestContext;
    assessment: PestRiskAssessment;
    weather: WeatherForecast;
    trace: IntakeTraceEvent[];
    sourceTraceIds: string[];
  }): Promise<PestAssessmentRecord>;
  listAssessments(input: { farmId?: string; planId?: string; limit?: number }): Promise<PestAssessmentRecord[]>;
  createAlert(input: {
    context: PestContext;
    assessmentId?: string;
    risk: PestRisk;
    weather: WeatherForecast;
  }): Promise<boolean>;
  close?(): Promise<void>;
}

export class OpenMeteoPestWeatherProvider implements PestWeatherProvider {
  async get(locationText: string): Promise<WeatherForecast> {
    return getWeatherForecast(locationText);
  }
}

export class InMemoryPestRiskStore implements PestRiskStore {
  readonly assessments: PestAssessmentRecord[] = [];
  readonly alerts: Array<{ context: PestContext; risk: PestRisk }> = [];

  constructor(private readonly context: PestContext = {}) {}

  async loadContext(input: PestRiskAssessInput): Promise<PestContext> {
    return { ...this.context, ...stripUndefined(input) };
  }

  async saveAssessment(input: {
    context: PestContext;
    assessment: PestRiskAssessment;
    weather: WeatherForecast;
    trace: IntakeTraceEvent[];
    sourceTraceIds: string[];
  }): Promise<PestAssessmentRecord> {
    const record = assessmentRecordFrom(input, randomUUID(), new Date().toISOString());
    this.assessments.unshift(record);
    return record;
  }

  async listAssessments(input: { farmId?: string; planId?: string; limit?: number }): Promise<PestAssessmentRecord[]> {
    const limit = normalizeLimit(input.limit, 20);
    return this.assessments
      .filter((row) => !input.farmId || row.farmId === input.farmId)
      .filter((row) => !input.planId || row.planId === input.planId)
      .slice(0, limit);
  }

  async createAlert(input: { context: PestContext; risk: PestRisk }): Promise<boolean> {
    this.alerts.push({ context: input.context, risk: input.risk });
    return true;
  }
}

export class PostgresPestRiskStore implements PestRiskStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async loadContext(input: PestRiskAssessInput): Promise<PestContext> {
    const rows = await this.prisma.$queryRaw<ContextRow[]>`
      SELECT
        fp."id" AS "farmer_id",
        f."id" AS "farm_id",
        s."id" AS "session_id",
        p."id" AS "plan_id",
        p."crop" AS "plan_crop",
        f."current_crop",
        f."target_season",
        f."location_text",
        f."size_acres"::text,
        MIN(i."start_date") FILTER (WHERE i."item_type" IN ('sowing', 'transplanting', 'planting')) AS "sow_date"
      FROM "farm_profiles" f
      JOIN "farmer_profiles" fp ON fp."id" = f."farmer_id"
      LEFT JOIN LATERAL (
        SELECT * FROM "agent_sessions" s2
        WHERE s2."farm_id" = f."id"
        ORDER BY "updated_at" DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT * FROM "season_plans" p2
        WHERE
          (${input.planId ?? null}::uuid IS NOT NULL AND p2."id" = ${input.planId ?? null}::uuid)
          OR (${input.planId ?? null}::uuid IS NULL AND p2."farm_id" = f."id")
        ORDER BY p2."updated_at" DESC
        LIMIT 1
      ) p ON true
      LEFT JOIN "season_plan_items" i ON i."plan_id" = p."id"
      WHERE
        (${input.planId ?? null}::uuid IS NOT NULL AND p."id" = ${input.planId ?? null}::uuid)
        OR (${input.farmId ?? null}::uuid IS NOT NULL AND f."id" = ${input.farmId ?? null}::uuid)
        OR (${input.farmerId ?? null}::uuid IS NOT NULL AND fp."id" = ${input.farmerId ?? null}::uuid)
        OR (${input.sessionId ?? null}::uuid IS NOT NULL AND s."id" = ${input.sessionId ?? null}::uuid)
      GROUP BY fp."id", f."id", s."id", p."id", p."crop", f."current_crop", f."target_season", f."location_text", f."size_acres"
      LIMIT 1
    `;
    const row = rows[0];
    return {
      farmerId: input.farmerId ?? row?.farmer_id ?? undefined,
      farmId: input.farmId ?? row?.farm_id ?? undefined,
      sessionId: input.sessionId ?? row?.session_id ?? undefined,
      planId: input.planId ?? row?.plan_id ?? undefined,
      crop: input.crop ?? row?.plan_crop ?? undefined,
      currentCrop: row?.current_crop ?? undefined,
      targetSeason: row?.target_season ?? undefined,
      locationText: input.locationText ?? row?.location_text ?? undefined,
      areaAcres: input.areaAcres ?? toNumber(row?.size_acres),
      sowDate: row?.sow_date ? row.sow_date.toISOString().slice(0, 10) : undefined,
    };
  }

  async saveAssessment(input: {
    context: PestContext;
    assessment: PestRiskAssessment;
    weather: WeatherForecast;
    trace: IntakeTraceEvent[];
    sourceTraceIds: string[];
  }): Promise<PestAssessmentRecord> {
    const rows = await this.prisma.$queryRaw<AssessmentRow[]>`
      INSERT INTO "pest_disease_assessments" (
        "id", "farmer_id", "farm_id", "session_id", "plan_id", "crop_id", "crop_label",
        "growth_stage", "days_after_sowing", "location_text", "area_acres", "highest_severity",
        "risks", "weather", "trace", "source_trace_ids"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${input.context.farmerId ?? null}::uuid,
        ${input.context.farmId ?? null}::uuid,
        ${input.context.sessionId ?? null}::uuid,
        ${input.context.planId ?? null}::uuid,
        ${input.assessment.cropId},
        ${input.assessment.cropLabel},
        ${input.assessment.growthStage},
        ${input.assessment.daysAfterSowing ?? null},
        ${input.weather.locationText},
        ${input.assessment.areaAcres},
        ${input.assessment.highestSeverity},
        ${JSON.stringify(input.assessment.risks)}::jsonb,
        ${JSON.stringify(input.weather)}::jsonb,
        ${JSON.stringify(input.trace)}::jsonb,
        ${input.sourceTraceIds}
      )
      RETURNING
        "id", "farmer_id", "farm_id", "session_id", "plan_id", "crop_id", "crop_label",
        "growth_stage", "days_after_sowing", "location_text", "area_acres"::text,
        "highest_severity", "risks", "weather", "trace", "source_trace_ids", "created_at"
    `;
    return mapAssessment(rows[0]!);
  }

  async listAssessments(input: { farmId?: string; planId?: string; limit?: number }): Promise<PestAssessmentRecord[]> {
    const limit = normalizeLimit(input.limit, 20);
    const rows = await this.prisma.$queryRaw<AssessmentRow[]>`
      SELECT
        "id", "farmer_id", "farm_id", "session_id", "plan_id", "crop_id", "crop_label",
        "growth_stage", "days_after_sowing", "location_text", "area_acres"::text,
        "highest_severity", "risks", "weather", "trace", "source_trace_ids", "created_at"
      FROM "pest_disease_assessments"
      WHERE (${input.farmId ?? null}::uuid IS NULL OR "farm_id" = ${input.farmId ?? null}::uuid)
        AND (${input.planId ?? null}::uuid IS NULL OR "plan_id" = ${input.planId ?? null}::uuid)
      ORDER BY "created_at" DESC
      LIMIT ${limit}
    `;
    return rows.map(mapAssessment);
  }

  async createAlert(input: {
    context: PestContext;
    assessmentId?: string;
    risk: PestRisk;
    weather: WeatherForecast;
  }): Promise<boolean> {
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO "proactive_alerts" (
        "farm_id", "session_id", "plan_id", "alert_type", "severity", "title",
        "message", "recommendation", "rule_id", "trigger_date", "raw_evidence", "fingerprint"
      )
      VALUES (
        ${input.context.farmId ?? null}::uuid,
        ${input.context.sessionId ?? null}::uuid,
        ${input.context.planId ?? null}::uuid,
        'pest_disease_risk',
        ${input.risk.severity},
        ${`${input.risk.issueName} risk`},
        ${`${input.risk.issueName} risk scored ${input.risk.score}/100 for ${input.weather.locationText}.`},
        ${input.risk.prevention.text},
        ${`pest.${input.risk.ruleId}`},
        ${input.weather.daily[0]?.date ?? new Date().toISOString().slice(0, 10)}::date,
        ${JSON.stringify({
          assessmentId: input.assessmentId,
          risk: input.risk,
          weather: input.weather,
        })}::jsonb,
        ${`pest:${input.context.farmId ?? "adhoc"}:${input.context.planId ?? "no-plan"}:${input.risk.ruleId}:${input.weather.daily[0]?.date ?? "today"}`}
      )
      ON CONFLICT ("fingerprint") DO NOTHING
    `;
    return inserted > 0;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export class PestRiskService {
  constructor(
    private readonly store: PestRiskStore = getDefaultPestRiskStore(),
    private readonly weatherProvider: PestWeatherProvider = new OpenMeteoPestWeatherProvider(),
  ) {}

  async assess(input: PestRiskAssessInput): Promise<PestRiskAssessResult> {
    const trace: IntakeTraceEvent[] = [];
    const context = await this.store.loadContext(input);
    const cropId = resolvePestCropId(String(input.cropId ?? input.crop ?? context.crop ?? context.currentCrop ?? ""), context.targetSeason);
    if (!cropId) throw new Error("cropId or crop is required and must resolve to rice, potato, or tomato");

    const growthStage = normalizeGrowthStage(input.growthStage, input.daysAfterSowing, context.sowDate);
    const areaAcres = input.areaAcres ?? context.areaAcres ?? 1;
    const locationText = input.locationText ?? context.locationText;
    if (!locationText) throw new Error("locationText is required unless farmId or planId can provide it");

    const weatherStarted = Date.now();
    let weather: WeatherForecast;
    try {
      weather = await this.weatherProvider.get(locationText);
      trace.push(traceEvent("pest.weather.fetch", { locationText }, weather, Date.now() - weatherStarted));
    } catch (error) {
      weather = mockWeatherForecast(locationText);
      trace.push(traceEvent(
        "pest.weather.fetch",
        { locationText },
        { fallback: weather },
        Date.now() - weatherStarted,
        "error",
        (error as Error).message,
      ));
    }

    const assessment = assessPestDiseaseRisk({
      cropId,
      growthStage,
      daysAfterSowing: input.daysAfterSowing ?? daysSince(context.sowDate),
      areaAcres,
      weather,
    });
    trace.push(traceEvent("pest.rule.evaluate", {
      cropId,
      growthStage,
      daysAfterSowing: assessment.daysAfterSowing,
      areaAcres,
      weatherFeatures: assessment.weatherFeatures,
    }, {
      risks: assessment.risks.map((risk) => ({
        ruleId: risk.ruleId,
        issueName: risk.issueName,
        severity: risk.severity,
        score: risk.score,
      })),
    }, 0));

    let savedAssessmentId: string | undefined;
    if (input.save !== false) {
      const saved = await this.store.saveAssessment({
        context,
        assessment,
        weather,
        trace,
        sourceTraceIds: trace.map((event) => event.traceId).filter(Boolean) as string[],
      });
      savedAssessmentId = saved.id;
      trace.push(traceEvent("pest.assessment.save", { assessmentId: saved.id }, { saved }, 0));
    }

    let alertsCreated = 0;
    if (input.createAlerts !== false) {
      for (const risk of assessment.risks.filter((item) => item.severity === "high")) {
        if (await this.store.createAlert({ context, assessmentId: savedAssessmentId, risk, weather })) alertsCreated++;
      }
      if (alertsCreated > 0) {
        trace.push(traceEvent("pest.alert.create", { severity: "high" }, { alertsCreated }, 0));
      }
    }

    return {
      assessment: { ...assessment, id: savedAssessmentId },
      weather,
      trace,
      alertsCreated,
      savedAssessmentId,
      context,
    };
  }

  async listAssessments(input: { farmId?: string; planId?: string; limit?: number }): Promise<PestAssessmentRecord[]> {
    return this.store.listAssessments(input);
  }
}

interface ContextRow {
  farmer_id: string | null;
  farm_id: string | null;
  session_id: string | null;
  plan_id: string | null;
  plan_crop: string | null;
  current_crop: string | null;
  target_season: string | null;
  location_text: string | null;
  size_acres: string | null;
  sow_date: Date | null;
}

interface AssessmentRow {
  id: string;
  farmer_id: string | null;
  farm_id: string | null;
  session_id: string | null;
  plan_id: string | null;
  crop_id: string;
  crop_label: string;
  growth_stage: string;
  days_after_sowing: number | null;
  location_text: string;
  area_acres: string;
  highest_severity: PestSeverity;
  risks: unknown;
  weather: unknown;
  trace: unknown;
  source_trace_ids: string[];
  created_at: Date;
}

function assessmentRecordFrom(
  input: {
    context: PestContext;
    assessment: PestRiskAssessment;
    weather: WeatherForecast;
    trace: IntakeTraceEvent[];
    sourceTraceIds: string[];
  },
  id: string,
  createdAt: string,
): PestAssessmentRecord {
  return {
    id,
    farmerId: input.context.farmerId,
    farmId: input.context.farmId,
    sessionId: input.context.sessionId,
    planId: input.context.planId,
    cropId: input.assessment.cropId,
    cropLabel: input.assessment.cropLabel,
    growthStage: input.assessment.growthStage,
    daysAfterSowing: input.assessment.daysAfterSowing,
    locationText: input.weather.locationText,
    areaAcres: input.assessment.areaAcres,
    highestSeverity: input.assessment.highestSeverity,
    risks: input.assessment.risks,
    weather: input.weather,
    trace: [...input.trace],
    sourceTraceIds: [...input.sourceTraceIds],
    createdAt,
  };
}

function mapAssessment(row: AssessmentRow): PestAssessmentRecord {
  return {
    id: row.id,
    farmerId: row.farmer_id ?? undefined,
    farmId: row.farm_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    planId: row.plan_id ?? undefined,
    cropId: row.crop_id,
    cropLabel: row.crop_label,
    growthStage: row.growth_stage,
    daysAfterSowing: row.days_after_sowing ?? undefined,
    locationText: row.location_text,
    areaAcres: Number(row.area_acres),
    highestSeverity: row.highest_severity,
    risks: Array.isArray(row.risks) ? row.risks as PestRisk[] : [],
    weather: row.weather as WeatherForecast,
    trace: Array.isArray(row.trace) ? row.trace as IntakeTraceEvent[] : [],
    sourceTraceIds: row.source_trace_ids,
    createdAt: row.created_at.toISOString(),
  };
}

function normalizeGrowthStage(stage: string | undefined, daysAfterSowing: number | undefined, sowDate: string | undefined): string {
  if (stage?.trim()) return stage.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const days = daysAfterSowing ?? daysSince(sowDate);
  if (days === undefined) return "vegetative";
  if (days < 20) return "seedling";
  if (days < 45) return "tillering";
  if (days < 70) return "vegetative";
  if (days < 95) return "flowering";
  return "grain_fill";
}

function daysSince(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const start = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(start)) return undefined;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

function traceEvent(
  toolName: string,
  parameters: Record<string, unknown>,
  rawResponse: unknown,
  latencyMs: number,
  status: "success" | "error" = "success",
  errorMessage?: string,
): IntakeTraceEvent {
  return {
    traceId: randomUUID(),
    kind: status === "error" ? "error" : "tool",
    toolName,
    parameters,
    rawResponse,
    status,
    errorMessage,
    latencyMs,
  };
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(limit ?? fallback, 1), 100);
}

function toNumber(value: string | undefined | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stripUndefined(input: PestRiskAssessInput): PestContext {
  const profile = input as Partial<IntakeProfile> & PestContext;
  return Object.fromEntries(Object.entries(profile).filter(([, value]) => value !== undefined)) as PestContext;
}

let defaultPestRiskStore: PestRiskStore | undefined;

export function getDefaultPestRiskStore(): PestRiskStore {
  defaultPestRiskStore ??= config.databaseUrl
    ? new PostgresPestRiskStore(config.databaseUrl)
    : new InMemoryPestRiskStore();
  return defaultPestRiskStore;
}

export const pestRiskService = new PestRiskService();
