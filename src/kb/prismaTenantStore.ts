/**
 * Postgres-backed TenantStore + TableOverrideStore (used when DATABASE_URL is set). The
 * canonical tenant string used across the KB is the tenant SLUG ("hub", "dist-kushtia"); these
 * stores translate slug ↔ uuid for the FK-bearing tables. Unverified against a live DB in CI —
 * exercised only when the Postgres stack is up.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { HUB, type TenantStore, type TenantRecord, type TenantRole, type CreateTenantInput } from "./tenancy.js";
import {
  resolveTableFrom,
  type TableOverrideStore,
  type TableOverride,
  type TableKind,
} from "./tableStore.js";

export class PrismaTenantStore implements TenantStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async createTenant(input: CreateTenantInput): Promise<TenantRecord> {
    const t = await this.prisma.tenant.create({
      data: { slug: input.slug, name: input.name, kind: input.kind ?? "district" },
    });
    return { id: t.id, slug: t.slug, name: t.name, kind: t.kind };
  }

  async getTenantBySlug(slug: string): Promise<TenantRecord | undefined> {
    const t = await this.prisma.tenant.findUnique({ where: { slug } });
    return t ? { id: t.id, slug: t.slug, name: t.name, kind: t.kind } : undefined;
  }

  async updateTenant(slug: string, input: Partial<Pick<CreateTenantInput, "name" | "kind">>): Promise<TenantRecord | undefined> {
    const existing = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!existing) return undefined;
    const t = await this.prisma.tenant.update({ where: { slug }, data: input });
    return { id: t.id, slug: t.slug, name: t.name, kind: t.kind };
  }

  async deleteTenant(slug: string): Promise<boolean> {
    if (slug === HUB) throw new Error("The hub tenant cannot be deleted");
    const result = await this.prisma.tenant.deleteMany({ where: { slug } });
    return result.count > 0;
  }

  private async idForSlug(slug: string): Promise<string | undefined> {
    const t = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    return t?.id;
  }

  async addJurisdiction(tenantSlug: string, district: string, upazila?: string): Promise<void> {
    const id = await this.idForSlug(tenantSlug);
    if (!id) throw new Error(`Unknown tenant ${tenantSlug}`);
    await this.prisma.tenantJurisdiction.create({
      data: { tenantId: id, district, upazila: upazila ?? null },
    });
  }

  async resolveTenantIdForDistrict(district: string, upazila?: string): Promise<string> {
    if (upazila) {
      const u = await this.prisma.tenantJurisdiction.findFirst({
        where: {
          district: { equals: district, mode: "insensitive" },
          upazila: { equals: upazila, mode: "insensitive" },
        },
        include: { tenant: { select: { slug: true } } },
      });
      if (u) return u.tenant.slug;
    }
    const d = await this.prisma.tenantJurisdiction.findFirst({
      where: { district: { equals: district, mode: "insensitive" }, upazila: null },
      include: { tenant: { select: { slug: true } } },
    });
    return d ? d.tenant.slug : HUB;
  }

  async addMember(tenantSlug: string, userId: string, role: TenantRole): Promise<void> {
    const id = await this.idForSlug(tenantSlug);
    if (!id) throw new Error(`Unknown tenant ${tenantSlug}`);
    await this.prisma.tenantMember.create({ data: { tenantId: id, userId, role } });
  }

  async getMemberRole(tenantSlug: string, userId: string): Promise<TenantRole | undefined> {
    const id = await this.idForSlug(tenantSlug);
    if (!id) return undefined;
    const m = await this.prisma.tenantMember.findFirst({ where: { tenantId: id, userId } });
    return (m?.role as TenantRole | undefined) ?? undefined;
  }
}

export class PrismaTableOverrideStore implements TableOverrideStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async addOverride(o: TableOverride): Promise<void> {
    await this.prisma.kbTableOverride.create({
      data: {
        tenantId: o.tenantId,
        kind: o.kind,
        cropId: o.cropId,
        district: o.district ?? null,
        payload: o.payload as object,
        source: o.source,
        dataOrigin: o.dataOrigin,
      },
    });
  }

  async list(kind: TableKind, cropId: string): Promise<TableOverride[]> {
    const rows = await this.prisma.kbTableOverride.findMany({ where: { kind, cropId } });
    return rows.map((r) => ({
      tenantId: r.tenantId,
      kind: r.kind as TableKind,
      cropId: r.cropId,
      district: r.district ?? undefined,
      payload: r.payload,
      source: r.source,
      dataOrigin: r.dataOrigin,
    }));
  }
}

/** Convenience re-export so callers can resolve without importing tableStore separately. */
export { resolveTableFrom };
