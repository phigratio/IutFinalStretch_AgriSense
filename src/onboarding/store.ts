/**
 * Onboarding store (navid role-based onboarding). Backs the three onboarding flows:
 *  - tenant requests (a user asks to become a tenant; admin decides)
 *  - farmer onboarding profiles (filled by self or by a tenant)
 *  - profile-assist requests (a user asks a tenant to fill their profile)
 * In-memory impl for tests/no-DB; Prisma impl when DATABASE_URL is set (mirrors the auth store).
 */

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";

export type RequestStatus = "pending" | "approved" | "rejected";
export type AssistStatus = "pending" | "claimed" | "fulfilled" | "cancelled";

export interface TenantRequestRecord {
  id: string;
  userId: string;
  orgName: string;
  district: string;
  upazila?: string;
  note?: string;
  status: RequestStatus;
  createdAt: string;
}

export interface FarmerOnboardingRecord {
  id: string;
  userId: string;
  fullName?: string;
  phone?: string;
  district: string;
  upazila?: string;
  farmSizeDecimals?: number;
  soilTexture?: string;
  waterAvailability?: string;
  budgetBdt?: number;
  targetSeason?: string;
  filledBy: "self" | "tenant";
  filledByUserId?: string;
  status: "draft" | "submitted";
  updatedAt: string;
}

export interface AssistRequestRecord {
  id: string;
  userId: string;
  fullName?: string;
  phone?: string;
  district: string;
  upazila?: string;
  note?: string;
  status: AssistStatus;
  claimedByTenantSlug?: string;
  claimedByUserId?: string;
  createdAt: string;
}

export interface OnboardingInput {
  userId: string;
  fullName?: string;
  phone?: string;
  district: string;
  upazila?: string;
  farmSizeDecimals?: number;
  soilTexture?: string;
  waterAvailability?: string;
  budgetBdt?: number;
  targetSeason?: string;
  filledBy?: "self" | "tenant";
  filledByUserId?: string;
}

export interface OnboardingStore {
  createTenantRequest(input: { userId: string; orgName: string; district: string; upazila?: string; note?: string }): Promise<TenantRequestRecord>;
  listTenantRequests(status?: RequestStatus): Promise<TenantRequestRecord[]>;
  getTenantRequest(id: string): Promise<TenantRequestRecord | undefined>;
  decideTenantRequest(id: string, status: "approved" | "rejected", decidedBy: string): Promise<TenantRequestRecord | undefined>;

  upsertOnboarding(input: OnboardingInput): Promise<FarmerOnboardingRecord>;
  getOnboardingByUser(userId: string): Promise<FarmerOnboardingRecord | undefined>;

  createAssistRequest(input: { userId: string; fullName?: string; phone?: string; district: string; upazila?: string; note?: string }): Promise<AssistRequestRecord>;
  getAssistRequest(id: string): Promise<AssistRequestRecord | undefined>;
  listAssistRequests(filter?: { district?: string; status?: AssistStatus }): Promise<AssistRequestRecord[]>;
  claimAssistRequest(id: string, tenantSlug: string, userId: string): Promise<AssistRequestRecord | undefined>;
  fulfillAssistRequest(id: string): Promise<AssistRequestRecord | undefined>;

  reset?(): Promise<void>;
}

const now = (): string => new Date().toISOString();

export class InMemoryOnboardingStore implements OnboardingStore {
  private tenantReqs = new Map<string, TenantRequestRecord>();
  private onboardings = new Map<string, FarmerOnboardingRecord>(); // by userId
  private assists = new Map<string, AssistRequestRecord>();

  async createTenantRequest(input: { userId: string; orgName: string; district: string; upazila?: string; note?: string }): Promise<TenantRequestRecord> {
    const rec: TenantRequestRecord = { id: randomUUID(), status: "pending", createdAt: now(), ...input };
    this.tenantReqs.set(rec.id, rec);
    return rec;
  }
  async listTenantRequests(status?: RequestStatus): Promise<TenantRequestRecord[]> {
    return [...this.tenantReqs.values()].filter((r) => !status || r.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getTenantRequest(id: string): Promise<TenantRequestRecord | undefined> {
    return this.tenantReqs.get(id);
  }
  async decideTenantRequest(id: string, status: "approved" | "rejected"): Promise<TenantRequestRecord | undefined> {
    const r = this.tenantReqs.get(id);
    if (!r) return undefined;
    const updated = { ...r, status };
    this.tenantReqs.set(id, updated);
    return updated;
  }

  async upsertOnboarding(input: OnboardingInput): Promise<FarmerOnboardingRecord> {
    const rec: FarmerOnboardingRecord = {
      id: this.onboardings.get(input.userId)?.id ?? randomUUID(),
      filledBy: input.filledBy ?? "self",
      status: "submitted",
      updatedAt: now(),
      ...input,
    };
    this.onboardings.set(input.userId, rec);
    return rec;
  }
  async getOnboardingByUser(userId: string): Promise<FarmerOnboardingRecord | undefined> {
    return this.onboardings.get(userId);
  }

  async createAssistRequest(input: { userId: string; fullName?: string; phone?: string; district: string; upazila?: string; note?: string }): Promise<AssistRequestRecord> {
    const rec: AssistRequestRecord = { id: randomUUID(), status: "pending", createdAt: now(), ...input };
    this.assists.set(rec.id, rec);
    return rec;
  }
  async getAssistRequest(id: string): Promise<AssistRequestRecord | undefined> {
    return this.assists.get(id);
  }
  async listAssistRequests(filter?: { district?: string; status?: AssistStatus }): Promise<AssistRequestRecord[]> {
    return [...this.assists.values()]
      .filter((r) => (!filter?.district || r.district.toLowerCase() === filter.district.toLowerCase()) && (!filter?.status || r.status === filter.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async claimAssistRequest(id: string, tenantSlug: string, userId: string): Promise<AssistRequestRecord | undefined> {
    const r = this.assists.get(id);
    if (!r || r.status !== "pending") return undefined;
    const updated: AssistRequestRecord = { ...r, status: "claimed", claimedByTenantSlug: tenantSlug, claimedByUserId: userId };
    this.assists.set(id, updated);
    return updated;
  }
  async fulfillAssistRequest(id: string): Promise<AssistRequestRecord | undefined> {
    const r = this.assists.get(id);
    if (!r) return undefined;
    const updated: AssistRequestRecord = { ...r, status: "fulfilled" };
    this.assists.set(id, updated);
    return updated;
  }

  async reset(): Promise<void> {
    this.tenantReqs.clear();
    this.onboardings.clear();
    this.assists.clear();
  }
}

const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));

export class PrismaOnboardingStore implements OnboardingStore {
  private prisma: PrismaClient;
  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async createTenantRequest(input: { userId: string; orgName: string; district: string; upazila?: string; note?: string }): Promise<TenantRequestRecord> {
    const r = await this.prisma.tenantRequest.create({ data: { ...input } });
    return this.mapTenantReq(r);
  }
  async listTenantRequests(status?: RequestStatus): Promise<TenantRequestRecord[]> {
    const rows = await this.prisma.tenantRequest.findMany({ where: status ? { status } : {}, orderBy: { createdAt: "desc" } });
    return rows.map((r) => this.mapTenantReq(r));
  }
  async getTenantRequest(id: string): Promise<TenantRequestRecord | undefined> {
    const r = await this.prisma.tenantRequest.findUnique({ where: { id } });
    return r ? this.mapTenantReq(r) : undefined;
  }
  async decideTenantRequest(id: string, status: "approved" | "rejected", decidedBy: string): Promise<TenantRequestRecord | undefined> {
    try {
      const r = await this.prisma.tenantRequest.update({ where: { id }, data: { status, decidedBy } });
      return this.mapTenantReq(r);
    } catch {
      return undefined;
    }
  }

  async upsertOnboarding(input: OnboardingInput): Promise<FarmerOnboardingRecord> {
    const data = {
      fullName: input.fullName ?? null,
      phone: input.phone ?? null,
      district: input.district,
      upazila: input.upazila ?? null,
      farmSizeDecimals: input.farmSizeDecimals ?? null,
      soilTexture: input.soilTexture ?? null,
      waterAvailability: input.waterAvailability ?? null,
      budgetBdt: input.budgetBdt ?? null,
      targetSeason: input.targetSeason ?? null,
      filledBy: input.filledBy ?? "self",
      filledByUserId: input.filledByUserId ?? null,
      status: "submitted",
    };
    const r = await this.prisma.farmerOnboarding.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, ...data },
      update: data,
    });
    return this.mapOnboarding(r);
  }
  async getOnboardingByUser(userId: string): Promise<FarmerOnboardingRecord | undefined> {
    const r = await this.prisma.farmerOnboarding.findUnique({ where: { userId } });
    return r ? this.mapOnboarding(r) : undefined;
  }

  async createAssistRequest(input: { userId: string; fullName?: string; phone?: string; district: string; upazila?: string; note?: string }): Promise<AssistRequestRecord> {
    const r = await this.prisma.profileAssistRequest.create({ data: { ...input } });
    return this.mapAssist(r);
  }
  async getAssistRequest(id: string): Promise<AssistRequestRecord | undefined> {
    const r = await this.prisma.profileAssistRequest.findUnique({ where: { id } });
    return r ? this.mapAssist(r) : undefined;
  }
  async listAssistRequests(filter?: { district?: string; status?: AssistStatus }): Promise<AssistRequestRecord[]> {
    const rows = await this.prisma.profileAssistRequest.findMany({
      where: {
        ...(filter?.district ? { district: { equals: filter.district, mode: "insensitive" as const } } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.mapAssist(r));
  }
  async claimAssistRequest(id: string, tenantSlug: string, userId: string): Promise<AssistRequestRecord | undefined> {
    const existing = await this.prisma.profileAssistRequest.findUnique({ where: { id } });
    if (!existing || existing.status !== "pending") return undefined;
    const r = await this.prisma.profileAssistRequest.update({
      where: { id },
      data: { status: "claimed", claimedByTenantSlug: tenantSlug, claimedByUserId: userId },
    });
    return this.mapAssist(r);
  }
  async fulfillAssistRequest(id: string): Promise<AssistRequestRecord | undefined> {
    try {
      const r = await this.prisma.profileAssistRequest.update({ where: { id }, data: { status: "fulfilled" } });
      return this.mapAssist(r);
    } catch {
      return undefined;
    }
  }

  private mapTenantReq(r: { id: string; userId: string; orgName: string; district: string; upazila: string | null; note: string | null; status: string; createdAt: Date }): TenantRequestRecord {
    return { id: r.id, userId: r.userId, orgName: r.orgName, district: r.district, upazila: r.upazila ?? undefined, note: r.note ?? undefined, status: r.status as RequestStatus, createdAt: r.createdAt.toISOString() };
  }
  private mapOnboarding(r: Record<string, unknown>): FarmerOnboardingRecord {
    return {
      id: r.id as string, userId: r.userId as string, fullName: (r.fullName as string) ?? undefined, phone: (r.phone as string) ?? undefined,
      district: r.district as string, upazila: (r.upazila as string) ?? undefined, farmSizeDecimals: num(r.farmSizeDecimals),
      soilTexture: (r.soilTexture as string) ?? undefined, waterAvailability: (r.waterAvailability as string) ?? undefined,
      budgetBdt: num(r.budgetBdt), targetSeason: (r.targetSeason as string) ?? undefined, filledBy: r.filledBy as "self" | "tenant",
      filledByUserId: (r.filledByUserId as string) ?? undefined, status: r.status as "draft" | "submitted", updatedAt: (r.updatedAt as Date).toISOString(),
    };
  }
  private mapAssist(r: Record<string, unknown>): AssistRequestRecord {
    return {
      id: r.id as string, userId: r.userId as string, fullName: (r.fullName as string) ?? undefined, phone: (r.phone as string) ?? undefined,
      district: r.district as string, upazila: (r.upazila as string) ?? undefined, note: (r.note as string) ?? undefined,
      status: r.status as AssistStatus, claimedByTenantSlug: (r.claimedByTenantSlug as string) ?? undefined,
      claimedByUserId: (r.claimedByUserId as string) ?? undefined, createdAt: (r.createdAt as Date).toISOString(),
    };
  }
}

let defaultStore: OnboardingStore | undefined;
export function getDefaultOnboardingStore(): OnboardingStore {
  defaultStore ??= config.databaseUrl ? new PrismaOnboardingStore(config.databaseUrl) : new InMemoryOnboardingStore();
  return defaultStore;
}
export function setDefaultOnboardingStore(store: OnboardingStore): void {
  defaultStore = store;
}
