/**
 * Multi-tenant KB tenancy (navid/kb spec §1). A tenant owns a jurisdiction (districts/upazilas)
 * and a KB namespace it may write; the reserved `hub` tenant holds the national baseline. A
 * farmer's district resolves to a tenant, else falls back to `hub`. Storage-agnostic: an
 * in-memory store backs tests, a Prisma store backs the app (mirrors the auth store pattern).
 */

export const HUB = "hub";

export type TenantRole = "hub_admin" | "tenant_admin";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  kind: string; // district | ngo | coop | hub
}

export interface JurisdictionRecord {
  tenantId: string;
  district: string;
  upazila?: string;
}

export interface TenantContextRecord extends TenantRecord {
  role: TenantRole;
  jurisdictions: Array<Pick<JurisdictionRecord, "district" | "upazila">>;
}

export interface CreateTenantInput {
  slug: string;
  name: string;
  kind?: string;
}

export interface TenantStore {
  createTenant(input: CreateTenantInput): Promise<TenantRecord>;
  getTenantBySlug(slug: string): Promise<TenantRecord | undefined>;
  updateTenant(slug: string, input: Partial<Pick<CreateTenantInput, "name" | "kind">>): Promise<TenantRecord | undefined>;
  deleteTenant(slug: string): Promise<boolean>;
  addJurisdiction(tenantId: string, district: string, upazila?: string): Promise<void>;
  /** District → tenant id (slug), or HUB when no tenant claims it. Upazila match wins over district. */
  resolveTenantIdForDistrict(district: string, upazila?: string): Promise<string>;
  addMember(tenantId: string, userId: string, role: TenantRole): Promise<void>;
  getMemberRole(tenantId: string, userId: string): Promise<TenantRole | undefined>;
  getTenantForUser(userId: string): Promise<TenantContextRecord | undefined>;
}

export class TenantAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantAccessError";
  }
}

/**
 * Enforce that `userId` may write `tenantId`. A tenant_admin/hub_admin member of that tenant may
 * write it. Writing the `hub` tenant requires hub_admin. Throws TenantAccessError otherwise.
 */
export async function assertTenantWriteAccess(
  store: TenantStore,
  userId: string,
  tenantId: string,
): Promise<void> {
  const role = await store.getMemberRole(tenantId, userId);
  if (!role) {
    throw new TenantAccessError(`User ${userId} is not a member of tenant ${tenantId}`);
  }
  if (tenantId === HUB && role !== "hub_admin") {
    throw new TenantAccessError(`Writing the hub KB requires hub_admin`);
  }
}

/** Read/write namespace guard used by tenant-scoped service routes. */
export async function assertTenantAccess(
  store: TenantStore,
  userId: string,
  tenantId: string,
  requiredRole?: TenantRole,
): Promise<void> {
  const role = await store.getMemberRole(tenantId, userId);
  if (!role || (requiredRole && role !== requiredRole)) {
    throw new TenantAccessError(`User ${userId} cannot access tenant ${tenantId}`);
  }
}

const norm = (s: string): string => s.trim().toLowerCase();

/** In-memory tenant store for tests and no-DB dev. */
export class InMemoryTenantStore implements TenantStore {
  private tenants = new Map<string, TenantRecord>(); // slug -> record
  private jurisdictions: JurisdictionRecord[] = [];
  private members = new Map<string, TenantRole>(); // `${tenantId}:${userId}` -> role
  private seq = 0;

  async createTenant(input: CreateTenantInput): Promise<TenantRecord> {
    if (this.tenants.has(input.slug)) throw new Error(`Tenant ${input.slug} already exists`);
    const rec: TenantRecord = {
      id: `tenant-${++this.seq}`,
      slug: input.slug,
      name: input.name,
      kind: input.kind ?? "district",
    };
    this.tenants.set(input.slug, rec);
    return rec;
  }

  async getTenantBySlug(slug: string): Promise<TenantRecord | undefined> {
    return this.tenants.get(slug);
  }

  async updateTenant(slug: string, input: Partial<Pick<CreateTenantInput, "name" | "kind">>): Promise<TenantRecord | undefined> {
    const current = this.tenants.get(slug);
    if (!current) return undefined;
    const updated = { ...current, ...input };
    this.tenants.set(slug, updated);
    return updated;
  }

  async deleteTenant(slug: string): Promise<boolean> {
    if (slug === HUB) throw new Error("The hub tenant cannot be deleted");
    const deleted = this.tenants.delete(slug);
    this.jurisdictions = this.jurisdictions.filter((j) => j.tenantId !== slug);
    for (const key of this.members.keys()) if (key.startsWith(`${slug}:`)) this.members.delete(key);
    return deleted;
  }

  async addJurisdiction(tenantId: string, district: string, upazila?: string): Promise<void> {
    this.jurisdictions.push({ tenantId, district, upazila });
  }

  async resolveTenantIdForDistrict(district: string, upazila?: string): Promise<string> {
    if (upazila) {
      const u = this.jurisdictions.find(
        (j) => j.upazila && norm(j.district) === norm(district) && norm(j.upazila) === norm(upazila),
      );
      if (u) return u.tenantId;
    }
    const d = this.jurisdictions.find(
      (j) => !j.upazila && norm(j.district) === norm(district),
    );
    return d ? d.tenantId : HUB;
  }

  async addMember(tenantId: string, userId: string, role: TenantRole): Promise<void> {
    this.members.set(`${tenantId}:${userId}`, role);
  }

  async getMemberRole(tenantId: string, userId: string): Promise<TenantRole | undefined> {
    return this.members.get(`${tenantId}:${userId}`);
  }

  async getTenantForUser(userId: string): Promise<TenantContextRecord | undefined> {
    for (const [key, role] of this.members) {
      const [tenantId, memberId] = key.split(":");
      if (memberId !== userId) continue;
      const tenant = this.tenants.get(tenantId);
      if (!tenant) continue;
      return {
        ...tenant,
        role,
        jurisdictions: this.jurisdictions
          .filter((item) => item.tenantId === tenantId)
          .map(({ district, upazila }) => ({ district, upazila })),
      };
    }
    return undefined;
  }

  reset(): void {
    this.tenants.clear();
    this.jurisdictions.length = 0;
    this.members.clear();
    this.seq = 0;
  }
}
