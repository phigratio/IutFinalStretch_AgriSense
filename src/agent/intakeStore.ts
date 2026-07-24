/**
 * Persistence boundary for T0-1 intake. Postgres is the source of truth for
 * profiles/sessions/traces; tests use the in-memory implementation.
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";
import { type IntakeField, type IntakeProfile, type IntakeTraceEvent } from "./intakeSchema.js";

export interface IntakeStore {
  loadOrCreate(input: {
    sessionId?: string;
    farmerId?: string;
    farmId?: string;
    bdappsMobile?: string;
    channel?: string;
  }): Promise<IntakeProfile>;
  saveProfile(profile: IntakeProfile, missingFields: IntakeField[], status: string): Promise<IntakeProfile>;
  saveTrace(sessionId: string, event: IntakeTraceEvent): Promise<void>;
  close?(): Promise<void>;
}

interface JoinedProfileRow {
  session_id: string;
  farmer_id: string;
  farm_id: string;
  preferred_name: string | null;
  bdapps_mobile: string | null;
  preferred_language: string;
  location_text: string | null;
  latitude: string | null;
  longitude: string | null;
  size_acres: string | null;
  soil_type: string | null;
  water_availability: string | null;
  budget_bdt: string | null;
  target_season: string | null;
  current_crop: string | null;
}

export class InMemoryIntakeStore implements IntakeStore {
  private profiles = new Map<string, IntakeProfile>();
  readonly traces = new Map<string, IntakeTraceEvent[]>();

  async loadOrCreate(input: {
    sessionId?: string;
    farmerId?: string;
    farmId?: string;
    bdappsMobile?: string;
  }): Promise<IntakeProfile> {
    if (input.sessionId) {
      const existing = this.profiles.get(input.sessionId);
      if (existing) return existing;
    }

    const profile: IntakeProfile = {
      sessionId: input.sessionId ?? randomUUID(),
      farmerId: input.farmerId ?? randomUUID(),
      farmId: input.farmId ?? randomUUID(),
      bdappsMobile: input.bdappsMobile,
      preferredLanguage: "en",
    };
    this.profiles.set(profile.sessionId!, profile);
    return profile;
  }

  async saveProfile(profile: IntakeProfile): Promise<IntakeProfile> {
    this.profiles.set(profile.sessionId!, profile);
    return profile;
  }

  async saveTrace(sessionId: string, event: IntakeTraceEvent): Promise<void> {
    const events = this.traces.get(sessionId) ?? [];
    events.push(event);
    this.traces.set(sessionId, events);
  }
}

export class PostgresIntakeStore implements IntakeStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async loadOrCreate(input: {
    sessionId?: string;
    farmerId?: string;
    farmId?: string;
    bdappsMobile?: string;
    channel?: string;
  }): Promise<IntakeProfile> {
    if (input.sessionId) {
      const profile = await this.findBySessionId(input.sessionId);
      if (profile) return profile;
    }

    if (input.farmId) {
      const profile = await this.findByFarmId(input.farmId);
      if (profile) return profile;
    }

    const farmerId = input.farmerId ?? randomUUID();
    const farmId = input.farmId ?? randomUUID();
    const sessionId = input.sessionId ?? randomUUID();

    await this.prisma.$executeRaw`
      INSERT INTO "farmer_profiles" ("id", "bdapps_mobile", "preferred_language")
      VALUES (${farmerId}::uuid, ${input.bdappsMobile ?? null}, 'en')
      ON CONFLICT ("id") DO UPDATE SET
        "bdapps_mobile" = COALESCE(EXCLUDED."bdapps_mobile", "farmer_profiles"."bdapps_mobile"),
        "updated_at" = CURRENT_TIMESTAMP
    `;

    await this.prisma.$executeRaw`
      INSERT INTO "farm_profiles" ("id", "farmer_id")
      VALUES (${farmId}::uuid, ${farmerId}::uuid)
      ON CONFLICT ("id") DO NOTHING
    `;

    await this.prisma.$executeRaw`
      INSERT INTO "agent_sessions" ("id", "farmer_id", "farm_id", "channel", "status")
      VALUES (${sessionId}::uuid, ${farmerId}::uuid, ${farmId}::uuid, ${input.channel ?? "web"}, 'intake')
      ON CONFLICT ("id") DO NOTHING
    `;

    return (await this.findBySessionId(sessionId))!;
  }

  async saveProfile(profile: IntakeProfile, missingFields: IntakeField[], status: string): Promise<IntakeProfile> {
    await this.prisma.$executeRaw`
      UPDATE "farmer_profiles"
      SET
        "preferred_name" = ${profile.farmerName ?? null},
        "bdapps_mobile" = ${profile.bdappsMobile ?? null},
        "preferred_language" = ${profile.preferredLanguage ?? "en"},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${profile.farmerId}::uuid
    `;

    await this.prisma.$executeRaw`
      UPDATE "farm_profiles"
      SET
        "location_text" = ${profile.locationText ?? null},
        "latitude" = ${profile.latitude ?? null},
        "longitude" = ${profile.longitude ?? null},
        "size_acres" = ${profile.sizeAcres ?? null},
        "soil_type" = ${profile.soilType ?? null},
        "water_availability" = ${profile.waterAvailability ?? null},
        "budget_bdt" = ${profile.budgetBdt ?? null},
        "target_season" = ${profile.targetSeason ?? null},
        "current_crop" = ${profile.currentCrop ?? null},
        "metadata" = ${metadataFor(profile)},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${profile.farmId}::uuid
    `;

    await this.prisma.$executeRaw`
      UPDATE "agent_sessions"
      SET
        "missing_fields" = ${missingFields},
        "status" = ${status},
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${profile.sessionId}::uuid
    `;

    return (await this.findBySessionId(profile.sessionId!))!;
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

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private async findBySessionId(sessionId: string): Promise<IntakeProfile | undefined> {
    const rows = await this.prisma.$queryRaw<JoinedProfileRow[]>`
      SELECT
        s."id" AS "session_id",
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
        f."current_crop"
      FROM "agent_sessions" s
      JOIN "farmer_profiles" fp ON fp."id" = s."farmer_id"
      JOIN "farm_profiles" f ON f."id" = s."farm_id"
      WHERE s."id" = ${sessionId}::uuid
      LIMIT 1
    `;
    return rows[0] ? mapRow(rows[0]) : undefined;
  }

  private async findByFarmId(farmId: string): Promise<IntakeProfile | undefined> {
    const sessionId = randomUUID();
    const rows = await this.prisma.$queryRaw<{ farmer_id: string }[]>`
      SELECT "farmer_id" FROM "farm_profiles" WHERE "id" = ${farmId}::uuid LIMIT 1
    `;
    const row = rows[0];
    if (!row) return undefined;

    await this.prisma.$executeRaw`
      INSERT INTO "agent_sessions" ("id", "farmer_id", "farm_id", "channel", "status")
      VALUES (${sessionId}::uuid, ${row.farmer_id}::uuid, ${farmId}::uuid, 'web', 'intake')
    `;

    return this.findBySessionId(sessionId);
  }
}

function mapRow(row: JoinedProfileRow): IntakeProfile {
  return {
    sessionId: row.session_id,
    farmerId: row.farmer_id,
    farmId: row.farm_id,
    farmerName: row.preferred_name ?? undefined,
    bdappsMobile: row.bdapps_mobile ?? undefined,
    preferredLanguage: row.preferred_language,
    locationText: row.location_text ?? undefined,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    sizeAcres: toNumber(row.size_acres),
    soilType: row.soil_type ?? undefined,
    waterAvailability: row.water_availability ?? undefined,
    budgetBdt: toNumber(row.budget_bdt),
    targetSeason: row.target_season ?? undefined,
    currentCrop: row.current_crop ?? undefined,
  };
}

function toNumber(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function metadataFor(profile: IntakeProfile): Prisma.InputJsonValue {
  return {
    sizeOriginal: profile.sizeOriginal,
  };
}

let defaultIntakeStore: IntakeStore | undefined;

export function getDefaultIntakeStore(): IntakeStore {
  defaultIntakeStore ??= config.databaseUrl
    ? new PostgresIntakeStore(config.databaseUrl)
    : new InMemoryIntakeStore();
  return defaultIntakeStore;
}

