import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { buildMultilingualQuery, type SupportedLanguage } from "../language/localization.js";
import { mem0Client, type Mem0Client } from "../rag/mem0Client.js";
import { searchKB, type KbHit } from "../kb/vectorKb.js";
import { type IntakeProfile, type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { getDefaultMemoryOutcomeService, type MemoryLookupResult } from "../agrisense/memoryOutcomeService.js";

export interface ContextHydrationInput {
  message?: string;
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  bdappsMobile?: string;
  language?: SupportedLanguage;
  cropId?: string;
  refresh?: boolean;
  limit?: number;
}

export interface ContextMemoryItem {
  id: string;
  title: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface PriorAnalysis {
  id: string;
  kind: string;
  title: string;
  summary: string;
  score: number;
  createdAt: string;
}

export interface ContextBundle {
  identity: {
    cacheKey: string;
    memoryUserId: string;
    userId?: string;
    tenantId?: string;
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    bdappsMobile?: string;
  };
  cache: {
    status: "hit" | "miss" | "refresh";
    ttlMs: number;
    retrievedAt: string;
  };
  profile?: IntakeProfile;
  profileSnapshot?: IntakeProfile;
  memory: {
    outcomes: MemoryLookupResult["outcomes"];
    sessions: MemoryLookupResult["sessions"];
    mem0: ContextMemoryItem[];
  };
  priorAnalyses: PriorAnalysis[];
  kbHits: KbHit[];
  trace: IntakeTraceEvent[];
  warnings: string[];
}

interface ProfileRow {
  session_id: string | null;
  user_id: string | null;
  farmer_id: string;
  farm_id: string;
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
  district: string | null;
  upazila: string | null;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const CONTEXT_AGENT_ID = "agrisense-context";

export class ContextHydrator {
  private readonly cache = new Map<string, { expiresAt: number; bundle: ContextBundle }>();
  private readonly prisma?: PrismaClient;

  constructor(
    databaseUrl = config.databaseUrl,
    private readonly memoryClient: Mem0Client = mem0Client,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {
    this.prisma = databaseUrl
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
      : undefined;
  }

  async hydrate(input: ContextHydrationInput): Promise<ContextBundle> {
    const identity = resolveIdentity(input);
    const cached = this.cache.get(identity.cacheKey);
    if (!input.refresh && cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.bundle,
        cache: { ...cached.bundle.cache, status: "hit", retrievedAt: new Date().toISOString() },
      };
    }

    const trace: IntakeTraceEvent[] = [];
    const warnings: string[] = [];
    const limit = normalizeLimit(input.limit);
    const profile = await this.loadProfile(input, trace, warnings);
    const enrichedIdentity = {
      ...identity,
      userId: input.userId,
      tenantId: input.tenantId,
      farmerId: input.farmerId ?? profile?.farmerId,
      farmId: input.farmId ?? profile?.farmId,
      sessionId: input.sessionId ?? profile?.sessionId,
      bdappsMobile: input.bdappsMobile ?? profile?.bdappsMobile,
    };

    const outcomesStarted = Date.now();
    let memoryResult: MemoryLookupResult = { outcomes: [], sessions: [] };
    try {
      memoryResult = await getDefaultMemoryOutcomeService().list({
        userId: input.userId,
        farmerId: enrichedIdentity.farmerId,
        farmId: enrichedIdentity.farmId,
        bdappsMobile: enrichedIdentity.bdappsMobile,
        limit,
      });
      trace.push(event("context.outcomes.search", {
        userId: input.userId,
        farmerId: enrichedIdentity.farmerId,
        farmId: enrichedIdentity.farmId,
      }, {
        outcomes: memoryResult.outcomes.length,
        sessions: memoryResult.sessions.length,
      }, Date.now() - outcomesStarted));
    } catch (error) {
      warnings.push(`outcome memory unavailable: ${(error as Error).message}`);
      trace.push(errorEvent("context.outcomes.search", {}, (error as Error).message, Date.now() - outcomesStarted));
    }

    const query = buildContextQuery(input, profile, memoryResult);
    const canReusePrivateMemory = enrichedIdentity.memoryUserId !== "anonymous" || Boolean(profile);
    const mem0 = canReusePrivateMemory
      ? await this.searchMem0(enrichedIdentity.memoryUserId, query, input.language, limit, trace, warnings)
      : [];
    const tenantId = input.tenantId ?? districtTenant(profile);
    const kbHits = tenantId || input.cropId || profile
      ? await this.searchKnowledge(query, tenantId, input.cropId ?? cropFromProfile(profile), limit, trace, warnings)
      : [];
    const priorAnalyses = memoryResult.outcomes.map((outcome) => ({
      id: outcome.id,
      kind: outcome.kind,
      title: outcome.title,
      summary: outcome.summary,
      score: outcome.score,
      createdAt: outcome.createdAt,
    }));

    const bundle: ContextBundle = {
      identity: enrichedIdentity,
      cache: {
        status: input.refresh ? "refresh" : "miss",
        ttlMs: this.ttlMs,
        retrievedAt: new Date().toISOString(),
      },
      profile,
      profileSnapshot: profile,
      memory: {
        outcomes: memoryResult.outcomes,
        sessions: memoryResult.sessions,
        mem0,
      },
      priorAnalyses,
      kbHits,
      trace,
      warnings,
    };

    this.cache.set(identity.cacheKey, { expiresAt: Date.now() + this.ttlMs, bundle });
    return bundle;
  }

  invalidate(input: ContextHydrationInput): void {
    this.cache.delete(resolveIdentity(input).cacheKey);
  }

  async close(): Promise<void> {
    await this.prisma?.$disconnect();
  }

  private async loadProfile(
    input: ContextHydrationInput,
    trace: IntakeTraceEvent[],
    warnings: string[],
  ): Promise<IntakeProfile | undefined> {
    if (!this.prisma) return undefined;
    const started = Date.now();
    try {
      const rows = await this.prisma.$queryRaw<ProfileRow[]>`
        SELECT
          s."id" AS "session_id",
          COALESCE(s."user_id", fp."user_id") AS "user_id",
          fp."id" AS "farmer_id",
          f."id" AS "farm_id",
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
          f."district",
          f."upazila"
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
        WHERE
          (${uuidOrNull(input.farmId)}::uuid IS NOT NULL AND f."id" = ${uuidOrNull(input.farmId)}::uuid)
          OR (${uuidOrNull(input.farmerId)}::uuid IS NOT NULL AND fp."id" = ${uuidOrNull(input.farmerId)}::uuid)
          OR (${uuidOrNull(input.sessionId)}::uuid IS NOT NULL AND s."id" = ${uuidOrNull(input.sessionId)}::uuid)
          OR (${uuidOrNull(input.userId)}::uuid IS NOT NULL AND (fp."user_id" = ${uuidOrNull(input.userId)}::uuid OR s."user_id" = ${uuidOrNull(input.userId)}::uuid))
          OR (${input.bdappsMobile ?? null}::text IS NOT NULL AND fp."bdapps_mobile" = ${input.bdappsMobile ?? null})
        ORDER BY s."updated_at" DESC NULLS LAST, f."updated_at" DESC
        LIMIT 1
      `;
      const profile = rows[0] ? mapProfile(rows[0]) : undefined;
      trace.push(event("context.profile.load", {
        userId: input.userId,
        farmerId: input.farmerId,
        farmId: input.farmId,
        sessionId: input.sessionId,
      }, { found: Boolean(profile), profile }, Date.now() - started));
      return profile;
    } catch (error) {
      warnings.push(`profile context unavailable: ${(error as Error).message}`);
      trace.push(errorEvent("context.profile.load", {}, (error as Error).message, Date.now() - started));
      return undefined;
    }
  }

  private async searchMem0(
    memoryUserId: string,
    query: string,
    language: SupportedLanguage | undefined,
    limit: number,
    trace: IntakeTraceEvent[],
    warnings: string[],
  ): Promise<ContextMemoryItem[]> {
    if (!config.mem0PersistenceEnabled) return [];
    const started = Date.now();
    try {
      const raw = await this.memoryClient.search({
        userId: memoryUserId,
        agentId: "agrisense-intake",
        query,
        language,
        limit,
      });
      const items = normalizeMem0(raw).slice(0, limit);
      trace.push(event("context.mem0.search", { memoryUserId, agentId: "agrisense-intake", query }, {
        count: items.length,
        items,
      }, Date.now() - started));
      return items;
    } catch (error) {
      warnings.push(`mem0 context unavailable: ${(error as Error).message}`);
      trace.push(errorEvent("context.mem0.search", { memoryUserId }, (error as Error).message, Date.now() - started));
      return [];
    }
  }

  private async searchKnowledge(
    query: string,
    tenantId: string | undefined,
    cropId: string | undefined,
    limit: number,
    trace: IntakeTraceEvent[],
    warnings: string[],
  ): Promise<KbHit[]> {
    const started = Date.now();
    try {
      const hits = await searchKB(query, { tenantId, cropId, limit });
      trace.push(event("context.kb.retrieve", { tenantId, cropId, query }, {
        count: hits.length,
        hits,
      }, Date.now() - started));
      return hits;
    } catch (error) {
      warnings.push(`knowledge context unavailable: ${(error as Error).message}`);
      trace.push(errorEvent("context.kb.retrieve", { tenantId, cropId }, (error as Error).message, Date.now() - started));
      return [];
    }
  }
}

function resolveIdentity(input: ContextHydrationInput): ContextBundle["identity"] {
  const memoryUserId =
    input.userId ??
    input.tenantId ??
    input.farmerId ??
    input.farmId ??
    input.bdappsMobile ??
    input.sessionId ??
    "anonymous";
  return {
    cacheKey: [
      input.userId ? `user:${input.userId}` : undefined,
      input.tenantId ? `tenant:${input.tenantId}` : undefined,
      input.farmerId ? `farmer:${input.farmerId}` : undefined,
      input.farmId ? `farm:${input.farmId}` : undefined,
      input.bdappsMobile ? `mobile:${input.bdappsMobile}` : undefined,
      input.sessionId ? `session:${input.sessionId}` : undefined,
    ].filter(Boolean).join("|") || `memory:${memoryUserId}`,
    memoryUserId,
    userId: input.userId,
    tenantId: input.tenantId,
    farmerId: input.farmerId,
    farmId: input.farmId,
    sessionId: input.sessionId,
    bdappsMobile: input.bdappsMobile,
  };
}

function buildContextQuery(
  input: ContextHydrationInput,
  profile: IntakeProfile | undefined,
  memory: MemoryLookupResult,
): string {
  return buildMultilingualQuery([
    input.message,
    profile?.locationText,
    profile?.soilType,
    profile?.waterAvailability,
    profile?.targetSeason,
    profile?.currentCrop,
    input.cropId,
    ...memory.outcomes.slice(0, 3).map((outcome) => `${outcome.title} ${outcome.summary}`),
  ].filter(Boolean).join(" "));
}

function normalizeMem0(raw: unknown): ContextMemoryItem[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { results?: unknown[] })?.results)
      ? (raw as { results: unknown[] }).results
      : Array.isArray((raw as { memories?: unknown[] })?.memories)
        ? (raw as { memories: unknown[] }).memories
        : [];
  return list.map((item, index) => {
    const record = item as Record<string, unknown>;
    const metadata = objectValue(record.metadata) ?? {};
    return {
      id: String(record.id ?? metadata.id ?? `mem0:${index}`),
      title: String(metadata.title ?? metadata.source ?? "Memory"),
      content: String(record.memory ?? record.content ?? record.text ?? ""),
      score: typeof record.score === "number" ? record.score : 0,
      metadata,
    };
  });
}

function mapProfile(row: ProfileRow): IntakeProfile {
  return {
    sessionId: row.session_id ?? undefined,
    farmerId: row.farmer_id,
    farmId: row.farm_id,
    farmerName: row.preferred_name ?? undefined,
    bdappsMobile: row.bdapps_mobile ?? undefined,
    preferredLanguage: row.preferred_language === "bn" || row.preferred_language === "banglish" ? row.preferred_language : "en",
    locationText: row.location_text ?? undefined,
    latitude: numberValue(row.latitude),
    longitude: numberValue(row.longitude),
    sizeAcres: numberValue(row.size_acres),
    soilType: row.soil_type ?? undefined,
    waterAvailability: row.water_availability ?? undefined,
    budgetBdt: numberValue(row.budget_bdt),
    targetSeason: row.target_season ?? undefined,
    currentCrop: row.current_crop ?? undefined,
  };
}

function districtTenant(profile: IntakeProfile | undefined): string | undefined {
  const location = profile?.locationText?.split(",")[0]?.trim().toLowerCase().replace(/\s+/g, "-");
  return location || undefined;
}

function cropFromProfile(profile: IntakeProfile | undefined): string | undefined {
  const crop = profile?.currentCrop?.toLowerCase();
  if (!crop) return undefined;
  if (crop.includes("rice") || crop.includes("aman") || crop.includes("boro") || crop.includes("dhan")) return "rice";
  if (crop.includes("maize")) return "maize";
  if (crop.includes("mustard")) return "mustard";
  if (crop.includes("potato")) return "potato";
  return crop;
}

function event(
  toolName: string,
  parameters: Record<string, unknown>,
  rawResponse: unknown,
  latencyMs: number,
): IntakeTraceEvent {
  return { kind: "tool", toolName, parameters, rawResponse, status: "success", latencyMs };
}

function errorEvent(
  toolName: string,
  parameters: Record<string, unknown>,
  errorMessage: string,
  latencyMs: number,
): IntakeTraceEvent {
  return {
    kind: "error",
    toolName,
    parameters,
    rawResponse: { fallback: "continue-with-available-context" },
    status: "error",
    errorMessage,
    latencyMs,
  };
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? 8, 1), 25);
}

function uuidOrNull(value: string | undefined): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function numberValue(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export const contextHydrator = new ContextHydrator();
export { CONTEXT_AGENT_ID };
