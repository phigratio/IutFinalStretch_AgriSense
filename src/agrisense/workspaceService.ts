/**
 * Read-only workspace hydration for direct AgriSense stage entry points.
 * It turns existing Postgres traces/profiles/weather into clickable resume cards.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { requiredFieldGaps } from "../agent/requiredFieldGaps.js";
import { type IntakeProfile } from "../agent/intakeSchema.js";
import { getDefaultMemoryOutcomeService } from "./memoryOutcomeService.js";
import {
  type AgriSenseWorkspace,
  type CostBreakdownItem,
  type CropRecommendation,
  type RetrievedEvidence,
  type SeasonPlanResult,
  type SeasonPlanTask,
  type WeatherDaily,
  type WeatherForecast,
  type WorkspaceEvidenceCard,
  type WorkspaceFarmCard,
  type WorkspacePlanCard,
  type WorkspaceRankingCard,
  type WorkspaceSessionCard,
  type WorkspaceSuggestedAction,
  type WorkspaceWeatherCard,
} from "./types.js";

interface WorkspaceInput {
  userId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  bdappsMobile?: string;
  limit?: number;
}

interface FarmRow {
  farmer_id: string;
  farm_id: string;
  session_id: string | null;
  user_id: string | null;
  preferred_name: string | null;
  bdapps_mobile: string | null;
  preferred_language: string | null;
  location_text: string | null;
  latitude: string | null;
  longitude: string | null;
  size_acres: string | null;
  soil_type: string | null;
  water_availability: string | null;
  budget_bdt: string | null;
  target_season: string | null;
  current_crop: string | null;
  selected_crop: string | null;
  latest_plan_id: string | null;
  updated_at: Date;
}

interface SessionRow {
  id: string;
  farmer_id: string | null;
  farm_id: string | null;
  status: string;
  channel: string;
  selected_crop: string | null;
  summary: string | null;
  updated_at: Date;
}

interface WeatherRow {
  session_id: string | null;
  farm_id: string;
  provider: string;
  location_text: string;
  forecast_date: Date | string;
  rainfall_mm: string | number | null;
  temperature_min_c: string | number | null;
  temperature_max_c: string | number | null;
  humidity_pct: string | number | null;
  raw_response: unknown;
  created_at: Date;
}

interface EvidenceRow {
  session_id: string;
  farm_id: string | null;
  raw_response: unknown;
  finished_at: Date | null;
  started_at: Date;
}

interface RankingRow {
  session_id: string;
  farm_id: string | null;
  raw_response: unknown;
  finished_at: Date | null;
  started_at: Date;
}

interface PlanRow {
  id: string;
  session_id: string | null;
  farm_id: string;
  crop: string;
  reasoning: string;
  expected_yield: string | number;
  expected_revenue_bdt: string | number;
  total_cost_bdt: string | number;
  net_profit_bdt: string | number;
  roi_pct: string | number;
  break_even_yield: string | number;
  break_even_price_bdt_per_kg: string | number | null;
  created_at: Date;
  updated_at: Date;
}

interface PlanItemRow {
  plan_id: string;
  item_type: string;
  title: string;
  description: string;
  start_date: Date | string | null;
  end_date: Date | string | null;
  quantity: string | number | null;
  unit: string | null;
  unit_cost_bdt: string | number | null;
  total_cost_bdt: string | number | null;
  reasoning: string | null;
}

export class AgriSenseWorkspaceService {
  private readonly prisma?: PrismaClient;

  constructor(databaseUrl = config.databaseUrl) {
    this.prisma = databaseUrl
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
      : undefined;
  }

  async getWorkspace(input: WorkspaceInput): Promise<AgriSenseWorkspace> {
    if (!this.prisma) {
      return { farmCards: [], sessionCards: [], weatherCards: [], evidenceCards: [], rankingCards: [], planCards: [], outcomeCards: [], suggestedActions: [] };
    }

    const limit = normalizeLimit(input.limit);
    const farmRows = await this.loadFarms(input, limit);
    const sessionRows = await this.loadSessions(input, limit);
    const farmCards = farmRows.map(mapFarmCard);
    const sessionCards = sessionRows.map(mapSessionCard);
    const farmIds = unique([
      ...farmCards.map((card) => card.farmId),
      ...sessionCards.map((card) => card.farmId).filter(isString),
      input.farmId,
    ].filter(isString));
    const sessionIds = unique([
      ...farmCards.map((card) => card.sessionId).filter(isString),
      ...sessionCards.map((card) => card.id),
      input.sessionId,
    ].filter(isString));

    const [weatherCards, evidenceCards, rankingCards, planCards, memory] = await Promise.all([
      this.loadWeatherCards(farmIds, limit),
      this.loadEvidenceCards(sessionIds, limit),
      this.loadRankingCards(sessionIds, limit),
      this.loadPlanCards(farmIds, limit),
      getDefaultMemoryOutcomeService().list(input),
    ]);

    return {
      farmCards,
      sessionCards,
      weatherCards,
      evidenceCards,
      rankingCards,
      planCards,
      outcomeCards: memory.outcomes,
      suggestedActions: buildSuggestedActions(farmCards, weatherCards, evidenceCards),
    };
  }

  async close(): Promise<void> {
    await this.prisma?.$disconnect();
  }

  private loadFarms(input: WorkspaceInput, limit: number): Promise<FarmRow[]> {
    return this.prisma!.$queryRaw<FarmRow[]>`
      SELECT
        fp."id" AS "farmer_id",
        f."id" AS "farm_id",
        s."id" AS "session_id",
        COALESCE(s."user_id", fp."user_id") AS "user_id",
        fp."preferred_name",
        fp."bdapps_mobile",
        fp."preferred_language",
        f."location_text",
        f."latitude"::text,
        f."longitude"::text,
        f."size_acres"::text,
        f."soil_type",
        f."water_availability",
        f."budget_bdt"::text,
        f."target_season",
        f."current_crop",
        s."selected_crop",
        p."id" AS "latest_plan_id",
        GREATEST(f."updated_at", fp."updated_at", COALESCE(s."updated_at", f."updated_at")) AS "updated_at"
      FROM "farm_profiles" f
      JOIN "farmer_profiles" fp ON fp."id" = f."farmer_id"
      LEFT JOIN LATERAL (
        SELECT * FROM "agent_sessions" s2
        WHERE s2."farm_id" = f."id"
        ORDER BY
          CASE WHEN ${uuidOrNull(input.sessionId)}::uuid IS NOT NULL AND s2."id" = ${uuidOrNull(input.sessionId)}::uuid THEN 0 ELSE 1 END,
          s2."updated_at" DESC
        LIMIT 1
      ) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT "id" FROM "season_plans" p2
        WHERE p2."farm_id" = f."id"
        ORDER BY p2."updated_at" DESC
        LIMIT 1
      ) p ON TRUE
      WHERE
        (${uuidOrNull(input.farmId)}::uuid IS NOT NULL AND f."id" = ${uuidOrNull(input.farmId)}::uuid)
        OR (${uuidOrNull(input.farmerId)}::uuid IS NOT NULL AND fp."id" = ${uuidOrNull(input.farmerId)}::uuid)
        OR (${uuidOrNull(input.sessionId)}::uuid IS NOT NULL AND s."id" = ${uuidOrNull(input.sessionId)}::uuid)
        OR (${uuidOrNull(input.userId)}::uuid IS NOT NULL AND (fp."user_id" = ${uuidOrNull(input.userId)}::uuid OR s."user_id" = ${uuidOrNull(input.userId)}::uuid))
        OR (${input.bdappsMobile ?? null}::text IS NOT NULL AND fp."bdapps_mobile" = ${input.bdappsMobile ?? null})
        OR (${uuidOrNull(input.farmId)}::uuid IS NULL AND ${uuidOrNull(input.farmerId)}::uuid IS NULL AND ${uuidOrNull(input.sessionId)}::uuid IS NULL AND ${uuidOrNull(input.userId)}::uuid IS NULL AND ${input.bdappsMobile ?? null}::text IS NULL)
      ORDER BY "updated_at" DESC
      LIMIT ${limit}
    `;
  }

  private loadSessions(input: WorkspaceInput, limit: number): Promise<SessionRow[]> {
    return this.prisma!.$queryRaw<SessionRow[]>`
      SELECT "id", "farmer_id", "farm_id", "status", "channel", "selected_crop", "summary", "updated_at"
      FROM "agent_sessions"
      WHERE
        (${uuidOrNull(input.sessionId)}::uuid IS NOT NULL AND "id" = ${uuidOrNull(input.sessionId)}::uuid)
        OR (${uuidOrNull(input.farmId)}::uuid IS NOT NULL AND "farm_id" = ${uuidOrNull(input.farmId)}::uuid)
        OR (${uuidOrNull(input.farmerId)}::uuid IS NOT NULL AND "farmer_id" = ${uuidOrNull(input.farmerId)}::uuid)
        OR (${uuidOrNull(input.userId)}::uuid IS NOT NULL AND "user_id" = ${uuidOrNull(input.userId)}::uuid)
        OR (${uuidOrNull(input.farmId)}::uuid IS NULL AND ${uuidOrNull(input.farmerId)}::uuid IS NULL AND ${uuidOrNull(input.sessionId)}::uuid IS NULL AND ${uuidOrNull(input.userId)}::uuid IS NULL)
      ORDER BY "updated_at" DESC
      LIMIT ${limit}
    `;
  }

  private async loadWeatherCards(farmIds: string[], limit: number): Promise<WorkspaceWeatherCard[]> {
    if (farmIds.length === 0) return [];
    const rows = await this.prisma!.$queryRaw<WeatherRow[]>`
      SELECT
        "session_id", "farm_id", "provider", "location_text", "forecast_date",
        "rainfall_mm"::text, "temperature_min_c"::text, "temperature_max_c"::text,
        "humidity_pct"::text, "raw_response", "created_at"
      FROM "weather_snapshots"
      WHERE "farm_id" = ANY(${farmIds}::uuid[])
      ORDER BY "created_at" DESC, "forecast_date" ASC
      LIMIT ${Math.max(limit * 7, 7)}
    `;
    return mapWeatherCards(rows).slice(0, limit);
  }

  private async loadEvidenceCards(sessionIds: string[], limit: number): Promise<WorkspaceEvidenceCard[]> {
    if (sessionIds.length === 0) return [];
    const rows = await this.prisma!.$queryRaw<EvidenceRow[]>`
      SELECT c."session_id", s."farm_id", c."raw_response", c."finished_at", c."started_at"
      FROM "agent_tool_calls" c
      JOIN "agent_sessions" s ON s."id" = c."session_id"
      WHERE c."tool_name" = 'rag.retrieve'
        AND c."session_id" = ANY(${sessionIds}::uuid[])
      ORDER BY COALESCE(c."finished_at", c."started_at") DESC
      LIMIT ${limit}
    `;
    return rows.map(mapEvidenceCard);
  }

  private async loadRankingCards(sessionIds: string[], limit: number): Promise<WorkspaceRankingCard[]> {
    if (sessionIds.length === 0) return [];
    const rows = await this.prisma!.$queryRaw<RankingRow[]>`
      SELECT c."session_id", s."farm_id", c."raw_response", c."finished_at", c."started_at"
      FROM "agent_tool_calls" c
      JOIN "agent_sessions" s ON s."id" = c."session_id"
      WHERE c."tool_name" = 'crop.rank'
        AND c."session_id" = ANY(${sessionIds}::uuid[])
      ORDER BY COALESCE(c."finished_at", c."started_at") DESC
      LIMIT ${limit}
    `;
    return rows.map(mapRankingCard).filter((card) => card.cropRankings.length > 0);
  }

  private async loadPlanCards(farmIds: string[], limit: number): Promise<WorkspacePlanCard[]> {
    if (farmIds.length === 0) return [];
    const plans = await this.prisma!.$queryRaw<PlanRow[]>`
      SELECT
        "id", "session_id", "farm_id", "crop", "reasoning",
        "expected_yield"::text, "expected_revenue_bdt"::text, "total_cost_bdt"::text,
        "net_profit_bdt"::text, "roi_pct"::text, "break_even_yield"::text,
        "break_even_price_bdt_per_kg"::text, "created_at", "updated_at"
      FROM "season_plans"
      WHERE "farm_id" = ANY(${farmIds}::uuid[])
      ORDER BY "updated_at" DESC
      LIMIT ${limit}
    `;
    if (plans.length === 0) return [];
    const planIds = plans.map((plan) => plan.id);
    const items = await this.prisma!.$queryRaw<PlanItemRow[]>`
      SELECT
        "plan_id", "item_type", "title", "description", "start_date", "end_date",
        "quantity"::text, "unit", "unit_cost_bdt"::text, "total_cost_bdt"::text, "reasoning"
      FROM "season_plan_items"
      WHERE "plan_id" = ANY(${planIds}::uuid[])
      ORDER BY "start_date" ASC NULLS LAST, "created_at" ASC
    `;
    const itemsByPlan = new Map<string, PlanItemRow[]>();
    for (const item of items) {
      itemsByPlan.set(item.plan_id, [...(itemsByPlan.get(item.plan_id) ?? []), item]);
    }
    return plans.map((plan) => mapPlanCard(plan, itemsByPlan.get(plan.id) ?? []));
  }
}

function mapFarmCard(row: FarmRow): WorkspaceFarmCard {
  const profile: IntakeProfile = {
    sessionId: row.session_id ?? undefined,
    farmerId: row.farmer_id,
    farmId: row.farm_id,
    farmerName: row.preferred_name ?? undefined,
    bdappsMobile: row.bdapps_mobile ?? undefined,
    preferredLanguage: languageValue(row.preferred_language),
    locationText: row.location_text ?? undefined,
    latitude: numberValue(row.latitude),
    longitude: numberValue(row.longitude),
    sizeAcres: numberValue(row.size_acres),
    soilType: row.soil_type ?? undefined,
    waterAvailability: row.water_availability ?? undefined,
    budgetBdt: numberValue(row.budget_bdt),
    targetSeason: row.target_season ?? undefined,
    currentCrop: row.current_crop ?? row.selected_crop ?? undefined,
  };
  const missingFields = requiredFieldGaps(profile);
  return {
    farmerId: row.farmer_id,
    farmId: row.farm_id,
    sessionId: row.session_id ?? undefined,
    userId: row.user_id ?? undefined,
    profile,
    missingFields,
    completion: missingFields.length === 0 ? "complete" : "incomplete",
    selectedCrop: row.selected_crop ?? row.current_crop ?? undefined,
    latestPlanId: row.latest_plan_id ?? undefined,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSessionCard(row: SessionRow): WorkspaceSessionCard {
  return {
    id: row.id,
    farmerId: row.farmer_id ?? undefined,
    farmId: row.farm_id ?? undefined,
    status: row.status,
    channel: row.channel,
    selectedCrop: row.selected_crop ?? undefined,
    summary: row.summary ?? undefined,
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapWeatherCards(rows: WeatherRow[]): WorkspaceWeatherCard[] {
  const groups = new Map<string, WeatherRow[]>();
  for (const row of rows) {
    const key = `${row.farm_id}:${row.session_id ?? "none"}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((group) => {
    const first = group
      .slice()
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0]!;
    const daily = group
      .map((row): WeatherDaily => ({
        date: dateString(row.forecast_date),
        rainfallMm: numberValue(row.rainfall_mm) ?? 0,
        temperatureMinC: numberValue(row.temperature_min_c) ?? 0,
        temperatureMaxC: numberValue(row.temperature_max_c) ?? 0,
        humidityPct: numberValue(row.humidity_pct),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const uniqueDaily = [...new Map(daily.map((day) => [day.date, day])).values()].slice(0, 7);
    const geocode = objectValue(objectValue(first.raw_response)?.geocode);
    const weather: WeatherForecast = {
      provider: first.provider === "mock" ? "mock" : "open-meteo",
      locationText: first.location_text,
      latitude: numberValue(geocode?.latitude) ?? 0,
      longitude: numberValue(geocode?.longitude) ?? 0,
      daily: uniqueDaily,
      raw: first.raw_response,
    };
    return {
      farmId: first.farm_id,
      sessionId: first.session_id ?? undefined,
      weather,
      rain7dMm: round1(uniqueDaily.reduce((sum, day) => sum + day.rainfallMm, 0)),
      refreshedAt: first.created_at.toISOString(),
    };
  });
}

function mapEvidenceCard(row: EvidenceRow): WorkspaceEvidenceCard {
  const raw = objectValue(row.raw_response);
  const chunks = Array.isArray(raw?.chunks) ? raw.chunks : [];
  const retrievedEvidence = chunks.map(mapEvidence).filter((item): item is RetrievedEvidence => Boolean(item));
  return {
    sessionId: row.session_id,
    farmId: row.farm_id ?? undefined,
    count: retrievedEvidence.length,
    retrievedEvidence,
    retrievedAt: (row.finished_at ?? row.started_at).toISOString(),
  };
}

function mapEvidence(value: unknown): RetrievedEvidence | undefined {
  const record = objectValue(value);
  if (!record) return undefined;
  const source = record.source === "mem0" || record.source === "rag" || record.source === "seeded-baseline" ? record.source : "rag";
  return {
    id: stringValue(record.id) ?? stringValue(record.citation) ?? "evidence",
    source,
    title: stringValue(record.title) ?? stringValue(record.source) ?? "Evidence",
    content: stringValue(record.content) ?? stringValue(record.text) ?? "",
    citation: stringValue(record.citation),
    crop: stringValue(record.crop),
    metadata: objectValue(record.metadata),
  };
}

function mapRankingCard(row: RankingRow): WorkspaceRankingCard {
  const raw = Array.isArray(row.raw_response) ? row.raw_response : [];
  const cropRankings = raw.map(mapRanking).filter((item): item is CropRecommendation => Boolean(item));
  return {
    sessionId: row.session_id,
    farmId: row.farm_id ?? undefined,
    cropRankings,
    topCrop: cropRankings[0]?.crop,
    rankedAt: (row.finished_at ?? row.started_at).toISOString(),
  };
}

function mapRanking(value: unknown): CropRecommendation | undefined {
  const record = objectValue(value);
  if (!record) return undefined;
  const crop = stringValue(record.crop);
  if (!crop) return undefined;
  return {
    crop,
    suitabilityScore: numberValue(record.suitabilityScore) ?? 0,
    waterNeed: waterNeedValue(record.waterNeed),
    riskLevel: riskLevelValue(record.riskLevel),
    expectedYieldKg: numberValue(record.expectedYieldKg) ?? 0,
    expectedRevenueBdt: numberValue(record.expectedRevenueBdt) ?? 0,
    totalCostBdt: numberValue(record.totalCostBdt) ?? 0,
    netProfitBdt: numberValue(record.netProfitBdt) ?? 0,
    roiPct: numberValue(record.roiPct) ?? 0,
    breakEvenYieldKg: numberValue(record.breakEvenYieldKg) ?? 0,
    factors: objectValue(record.factors) as CropRecommendation["factors"] ?? {
      soilFit: 0,
      seasonFit: 0,
      waterFit: 0,
      tempFit: 0,
      budgetFit: 0,
    },
    reasoning: stringValue(record.reasoning) ?? "Saved crop ranking from prior agent trace.",
    citations: Array.isArray(record.citations) ? record.citations.filter(isString) : [],
  };
}

function mapPlanCard(plan: PlanRow, items: PlanItemRow[]): WorkspacePlanCard {
  const totalCost = numberValue(plan.total_cost_bdt) ?? 0;
  const financials = {
    expectedYieldKg: numberValue(plan.expected_yield) ?? 0,
    expectedRevenueBdt: numberValue(plan.expected_revenue_bdt) ?? 0,
    totalCostBdt: totalCost,
    netProfitBdt: numberValue(plan.net_profit_bdt) ?? 0,
    roiPct: numberValue(plan.roi_pct) ?? 0,
    breakEvenYieldKg: numberValue(plan.break_even_yield) ?? 0,
    pricePerKgBdt: numberValue(plan.break_even_price_bdt_per_kg) ?? 0,
    budgetBdt: 0,
    budgetSurplusBdt: 0,
    costBreakdown: [{
      category: "contingency",
      label: "Saved total production cost",
      amountBdt: totalCost,
      reasoning: "Reconstructed from saved season plan total cost.",
    } satisfies CostBreakdownItem],
  };
  const tasks = items.map(mapPlanTask);
  const seasonPlan: SeasonPlanResult = {
    id: plan.id,
    crop: plan.crop,
    sowDate: tasks[0]?.startDate ?? dateString(plan.created_at),
    harvestStartDate: tasks.find((task) => task.phase === "harvest")?.startDate ?? tasks[tasks.length - 1]?.startDate ?? dateString(plan.created_at),
    harvestEndDate: tasks.find((task) => task.phase === "harvest")?.endDate ?? tasks[tasks.length - 1]?.endDate ?? dateString(plan.created_at),
    tasks,
    financials,
    reasoning: plan.reasoning,
    selectedCropReason: "Loaded from saved season plan.",
    sourceTraceIds: [],
    automationTrigger: "saved_workspace_resume",
    retrievedEvidence: [],
  };
  return {
    sessionId: plan.session_id ?? undefined,
    farmId: plan.farm_id,
    planId: plan.id,
    crop: plan.crop,
    seasonPlan,
    generatedAt: plan.updated_at.toISOString(),
  };
}

function mapPlanTask(row: PlanItemRow): SeasonPlanTask {
  return {
    phase: phaseValue(row.item_type),
    title: row.title,
    description: row.description,
    startDate: row.start_date ? dateString(row.start_date) : new Date().toISOString().slice(0, 10),
    endDate: row.end_date ? dateString(row.end_date) : row.start_date ? dateString(row.start_date) : new Date().toISOString().slice(0, 10),
    quantity: numberValue(row.quantity),
    unit: row.unit ?? undefined,
    unitCostBdt: numberValue(row.unit_cost_bdt),
    totalCostBdt: numberValue(row.total_cost_bdt),
    reasoning: row.reasoning ?? "Loaded from saved season plan item.",
  };
}

function buildSuggestedActions(
  farms: WorkspaceFarmCard[],
  weather: WorkspaceWeatherCard[],
  evidence: WorkspaceEvidenceCard[],
): WorkspaceSuggestedAction[] {
  const actions: WorkspaceSuggestedAction[] = [];
  const selected = farms[0];
  if (!selected) return actions;
  const base = { farmId: selected.farmId, farmerId: selected.farmerId, sessionId: selected.sessionId };
  if (selected.completion === "incomplete") {
    actions.push({ id: "complete_intake", label: "Complete intake", workflowStage: "intake", ...base, reason: `${selected.missingFields.length} required field(s) missing.` });
    return actions;
  }
  actions.push({ id: "run_weather", label: weather.some((card) => card.farmId === selected.farmId) ? "Refresh weather" : "Fetch weather", workflowStage: "weather", ...base, reason: "Profile is complete enough for live weather grounding." });
  actions.push({ id: "run_evidence", label: evidence.some((card) => card.farmId === selected.farmId || card.sessionId === selected.sessionId) ? "Refresh evidence" : "Retrieve evidence", workflowStage: "evidence", ...base, reason: "Use profile plus weather to retrieve agronomic evidence." });
  actions.push({ id: "continue_crop_ranking", label: "Continue crop ranking", workflowStage: "crop_ranking", ...base, reason: "Weather and evidence can feed crop suitability ranking." });
  return actions;
}

function waterNeedValue(value: unknown): CropRecommendation["waterNeed"] {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function riskLevelValue(value: unknown): CropRecommendation["riskLevel"] {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function phaseValue(value: string): SeasonPlanTask["phase"] {
  if (value === "land-prep" || value === "sowing" || value === "fertilizer" || value === "irrigation" || value === "weed" || value === "pest-check" || value === "harvest") return value;
  return "land-prep";
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 8, 1), 25);
}

function uuidOrNull(value: string | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function languageValue(value: string | null): IntakeProfile["preferredLanguage"] {
  return value === "en" || value === "bn" || value === "banglish" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function dateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export const agriSenseWorkspaceService = new AgriSenseWorkspaceService();
