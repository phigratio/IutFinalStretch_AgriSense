import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";
import { mergeProfilePatch } from "../agent/requiredFieldGaps.js";
import { type IntakeProfile } from "../agent/intakeSchema.js";
import { type SeasonPlanResult } from "./types.js";

export type MemoryOutcomeKind =
  | "farm_fact"
  | "crop_decision"
  | "financial_result"
  | "risk_warning"
  | "pending_task"
  | "farmer_preference";

export interface MemoryOutcome {
  id: string;
  userId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  planId?: string;
  kind: MemoryOutcomeKind;
  title: string;
  summary: string;
  valueJson: Record<string, unknown>;
  score: number;
  sourceTraceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryLookupInput {
  userId?: string;
  farmerId?: string;
  farmId?: string;
  bdappsMobile?: string;
  limit?: number;
}

export interface MemorySessionSummary {
  id: string;
  status: string;
  channel: string;
  selectedCrop?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryLookupResult {
  outcomes: MemoryOutcome[];
  sessions: MemorySessionSummary[];
}

export interface CreatePlanOutcomesInput {
  userId?: string;
  farmerId: string;
  farmId: string;
  sessionId: string;
  profile: IntakeProfile;
  plan: SeasonPlanResult;
}

export interface MemoryOutcomeService {
  list(input: MemoryLookupInput): Promise<MemoryLookupResult>;
  applyToProfile(profile: IntakeProfile, outcomes: MemoryOutcome[], acceptedOutcomeIds?: string[]): IntakeProfile;
  rememberPlan(input: CreatePlanOutcomesInput): Promise<MemoryOutcome[]>;
  close?(): Promise<void>;
}

interface MemoryOutcomeRow {
  id: string;
  user_id: string | null;
  farmer_id: string | null;
  farm_id: string | null;
  session_id: string | null;
  plan_id: string | null;
  kind: MemoryOutcomeKind;
  title: string;
  summary: string;
  value_json: Prisma.JsonValue;
  score: string | number;
  source_trace_ids: string[];
  created_at: Date;
  updated_at: Date;
}

interface SessionRow {
  id: string;
  status: string;
  channel: string;
  selected_crop: string | null;
  summary: string | null;
  created_at: Date;
  updated_at: Date;
}

export class InMemoryMemoryOutcomeService implements MemoryOutcomeService {
  readonly outcomes: MemoryOutcome[] = [];
  readonly sessions: MemorySessionSummary[] = [];

  constructor(initialOutcomes: MemoryOutcome[] = []) {
    this.outcomes = [...initialOutcomes];
  }

  async list(input: MemoryLookupInput): Promise<MemoryLookupResult> {
    const limit = normalizeLimit(input.limit);
    const matched = this.outcomes
      .filter((outcome) => matchesIdentity(outcome, input))
      .sort(compareOutcomes)
      .slice(0, limit);
    return { outcomes: matched, sessions: this.sessions.slice(0, limit) };
  }

  applyToProfile(profile: IntakeProfile, outcomes: MemoryOutcome[], acceptedOutcomeIds?: string[]): IntakeProfile {
    return applyOutcomesToProfile(profile, outcomes, acceptedOutcomeIds);
  }

  async rememberPlan(input: CreatePlanOutcomesInput): Promise<MemoryOutcome[]> {
    const created = buildPlanOutcomes(input).map((outcome) => ({
      ...outcome,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    this.outcomes.push(...created);
    return created;
  }
}

export class PostgresMemoryOutcomeService implements MemoryOutcomeService {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async list(input: MemoryLookupInput): Promise<MemoryLookupResult> {
    const limit = normalizeLimit(input.limit);
    const farmerIds = await this.resolveFarmerIds(input);
    const farmIds = await this.resolveFarmIds(input, farmerIds);

    const rows = await this.prisma.$queryRaw<MemoryOutcomeRow[]>`
      SELECT
        "id", "user_id", "farmer_id", "farm_id", "session_id", "plan_id",
        "kind", "title", "summary", "value_json", "score", "source_trace_ids",
        "created_at", "updated_at"
      FROM "agent_memory_outcomes"
      WHERE
        (${input.userId ?? null}::uuid IS NOT NULL AND "user_id" = ${input.userId ?? null}::uuid)
        OR (${farmerIds}::uuid[] <> ARRAY[]::uuid[] AND "farmer_id" = ANY(${farmerIds}::uuid[]))
        OR (${farmIds}::uuid[] <> ARRAY[]::uuid[] AND "farm_id" = ANY(${farmIds}::uuid[]))
      ORDER BY
        "score" DESC,
        "created_at" DESC
      LIMIT ${limit}
    `;

    const sessionRows = await this.prisma.$queryRaw<SessionRow[]>`
      SELECT "id", "status", "channel", "selected_crop", "summary", "created_at", "updated_at"
      FROM "agent_sessions"
      WHERE
        (${input.userId ?? null}::uuid IS NOT NULL AND "user_id" = ${input.userId ?? null}::uuid)
        OR (${farmerIds}::uuid[] <> ARRAY[]::uuid[] AND "farmer_id" = ANY(${farmerIds}::uuid[]))
        OR (${farmIds}::uuid[] <> ARRAY[]::uuid[] AND "farm_id" = ANY(${farmIds}::uuid[]))
      ORDER BY "updated_at" DESC
      LIMIT ${limit}
    `;

    return {
      outcomes: rows.map(mapOutcome),
      sessions: sessionRows.map(mapSession),
    };
  }

  applyToProfile(profile: IntakeProfile, outcomes: MemoryOutcome[], acceptedOutcomeIds?: string[]): IntakeProfile {
    return applyOutcomesToProfile(profile, outcomes, acceptedOutcomeIds);
  }

  async rememberPlan(input: CreatePlanOutcomesInput): Promise<MemoryOutcome[]> {
    const candidates = buildPlanOutcomes(input);
    const created: MemoryOutcome[] = [];

    for (const outcome of candidates) {
      const rows = await this.prisma.$queryRaw<MemoryOutcomeRow[]>`
        INSERT INTO "agent_memory_outcomes" (
          "id", "user_id", "farmer_id", "farm_id", "session_id", "plan_id",
          "kind", "title", "summary", "value_json", "score", "source_trace_ids"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${outcome.userId ?? null}::uuid,
          ${outcome.farmerId ?? null}::uuid,
          ${outcome.farmId ?? null}::uuid,
          ${outcome.sessionId ?? null}::uuid,
          ${outcome.planId ?? null}::uuid,
          ${outcome.kind},
          ${outcome.title},
          ${outcome.summary},
          ${toJsonb(outcome.valueJson)}::jsonb,
          ${outcome.score},
          ${outcome.sourceTraceIds}
        )
        RETURNING
          "id", "user_id", "farmer_id", "farm_id", "session_id", "plan_id",
          "kind", "title", "summary", "value_json", "score", "source_trace_ids",
          "created_at", "updated_at"
      `;
      created.push(mapOutcome(rows[0]!));
    }

    return created;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private async resolveFarmerIds(input: MemoryLookupInput): Promise<string[]> {
    const ids = new Set<string>();
    if (input.farmerId) ids.add(input.farmerId);
    if (input.bdappsMobile) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "farmer_profiles"
        WHERE "bdapps_mobile" = ${input.bdappsMobile}
        LIMIT 5
      `;
      rows.forEach((row) => ids.add(row.id));
    }
    return [...ids];
  }

  private async resolveFarmIds(input: MemoryLookupInput, farmerIds: string[]): Promise<string[]> {
    const ids = new Set<string>();
    if (input.farmId) ids.add(input.farmId);
    if (farmerIds.length > 0) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "farm_profiles"
        WHERE "farmer_id" = ANY(${farmerIds}::uuid[])
        LIMIT 10
      `;
      rows.forEach((row) => ids.add(row.id));
    }
    return [...ids];
  }
}

function applyOutcomesToProfile(profile: IntakeProfile, outcomes: MemoryOutcome[], acceptedOutcomeIds?: string[]): IntakeProfile {
  const accepted = acceptedOutcomeIds && acceptedOutcomeIds.length > 0 ? new Set(acceptedOutcomeIds) : undefined;
  const factPatch = outcomes
    .filter((outcome) => outcome.kind === "farm_fact")
    .filter((outcome) => !accepted || accepted.has(outcome.id))
    .sort(compareOutcomes)
    .reduce<Partial<IntakeProfile>>((patch, outcome) => {
      return { ...patch, ...pickProfileFields(outcome.valueJson) };
    }, {});

  return mergeProfilePatch(profile, {
    ...factPatch,
    sessionId: profile.sessionId,
    farmerId: profile.farmerId,
    farmId: profile.farmId,
  });
}

function buildPlanOutcomes(input: CreatePlanOutcomesInput): Array<Omit<MemoryOutcome, "id" | "createdAt" | "updatedAt">> {
  const profileFacts = pickProfileFields(input.profile as unknown as Record<string, unknown>);
  const financials = input.plan.financials;
  const sourceTraceIds = input.plan.sourceTraceIds ?? [];
  const firstPendingTask = input.plan.tasks[0];
  const outcomes: Array<Omit<MemoryOutcome, "id" | "createdAt" | "updatedAt">> = [
    {
      userId: input.userId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      planId: input.plan.id,
      kind: "farm_fact",
      title: "Farm profile",
      summary: summarizeProfile(input.profile),
      valueJson: profileFacts,
      score: 95,
      sourceTraceIds,
    },
    {
      userId: input.userId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      planId: input.plan.id,
      kind: "crop_decision",
      title: `Recommended ${input.plan.crop}`,
      summary: `${input.plan.crop} was selected for ${input.profile.targetSeason ?? "the target season"} with ${formatMoney(financials.netProfitBdt)} expected net profit.`,
      valueJson: {
        crop: input.plan.crop,
        sowDate: input.plan.sowDate,
        harvestStartDate: input.plan.harvestStartDate,
        harvestEndDate: input.plan.harvestEndDate,
        selectedCropReason: input.plan.selectedCropReason,
      },
      score: 90,
      sourceTraceIds,
    },
    {
      userId: input.userId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      planId: input.plan.id,
      kind: "financial_result",
      title: "Projected return",
      summary: `Expected revenue ${formatMoney(financials.expectedRevenueBdt)}, cost ${formatMoney(financials.totalCostBdt)}, ROI ${financials.roiPct}%.`,
      valueJson: financials as unknown as Record<string, unknown>,
      score: 85,
      sourceTraceIds,
    },
  ];

  if (firstPendingTask) {
    outcomes.push({
      userId: input.userId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      planId: input.plan.id,
      kind: "pending_task",
      title: firstPendingTask.title,
      summary: `${firstPendingTask.title} is scheduled ${firstPendingTask.startDate} to ${firstPendingTask.endDate}.`,
      valueJson: firstPendingTask as unknown as Record<string, unknown>,
      score: 80,
      sourceTraceIds,
    });
  }

  const riskyTask = input.plan.tasks.find((task) => /risk|pest|rain|delay|water|irrigation/i.test(`${task.title} ${task.description} ${task.reasoning}`));
  if (riskyTask) {
    outcomes.push({
      userId: input.userId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      planId: input.plan.id,
      kind: "risk_warning",
      title: `Watch: ${riskyTask.title}`,
      summary: riskyTask.reasoning || riskyTask.description,
      valueJson: riskyTask as unknown as Record<string, unknown>,
      score: 75,
      sourceTraceIds,
    });
  }

  return outcomes;
}

function pickProfileFields(value: Record<string, unknown>): Partial<IntakeProfile> {
  return {
    farmerName: stringValue(value.farmerName),
    bdappsMobile: stringValue(value.bdappsMobile),
    preferredLanguage: languageValue(value.preferredLanguage),
    locationText: stringValue(value.locationText),
    latitude: numberValue(value.latitude),
    longitude: numberValue(value.longitude),
    sizeAcres: numberValue(value.sizeAcres),
    sizeOriginal: objectValue(value.sizeOriginal) as IntakeProfile["sizeOriginal"],
    soilType: stringValue(value.soilType),
    waterAvailability: stringValue(value.waterAvailability),
    budgetBdt: numberValue(value.budgetBdt),
    targetSeason: stringValue(value.targetSeason),
    currentCrop: stringValue(value.currentCrop),
  };
}

function summarizeProfile(profile: IntakeProfile): string {
  return [
    profile.locationText,
    profile.sizeAcres ? `${profile.sizeAcres} acres` : undefined,
    profile.soilType,
    profile.waterAvailability,
    profile.budgetBdt ? formatMoney(profile.budgetBdt) : undefined,
    profile.targetSeason,
  ].filter(Boolean).join(" · ");
}

function matchesIdentity(outcome: MemoryOutcome, input: MemoryLookupInput): boolean {
  return Boolean(
    (input.userId && outcome.userId === input.userId) ||
    (input.farmerId && outcome.farmerId === input.farmerId) ||
    (input.farmId && outcome.farmId === input.farmId),
  );
}

function compareOutcomes(a: MemoryOutcome, b: MemoryOutcome): number {
  if (b.score !== a.score) return b.score - a.score;
  return Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

function mapOutcome(row: MemoryOutcomeRow): MemoryOutcome {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    farmerId: row.farmer_id ?? undefined,
    farmId: row.farm_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    planId: row.plan_id ?? undefined,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    valueJson: objectValue(row.value_json) ?? {},
    score: Number(row.score),
    sourceTraceIds: row.source_trace_ids,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSession(row: SessionRow): MemorySessionSummary {
  return {
    id: row.id,
    status: row.status,
    channel: row.channel,
    selectedCrop: row.selected_crop ?? undefined,
    summary: row.summary ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 8, 1), 25);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function languageValue(value: unknown): IntakeProfile["preferredLanguage"] {
  return value === "en" || value === "bn" || value === "banglish" ? value : undefined;
}

function formatMoney(value: number): string {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(value)}`;
}

function toJsonb(value: unknown): string {
  return JSON.stringify(value ?? null);
}

let defaultMemoryOutcomeService: MemoryOutcomeService | undefined;

export function getDefaultMemoryOutcomeService(): MemoryOutcomeService {
  defaultMemoryOutcomeService ??= config.databaseUrl
    ? new PostgresMemoryOutcomeService(config.databaseUrl)
    : new InMemoryMemoryOutcomeService();
  return defaultMemoryOutcomeService;
}
