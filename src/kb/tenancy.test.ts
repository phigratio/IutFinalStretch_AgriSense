import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryTenantStore,
  assertTenantWriteAccess,
  TenantAccessError,
  HUB,
} from "./tenancy.js";

let store: InMemoryTenantStore;
beforeEach(() => {
  store = new InMemoryTenantStore();
});

describe("tenant resolution by district", () => {
  it("resolves a district to its tenant, else falls back to hub", async () => {
    const t = await store.createTenant({ slug: "dist-kushtia", name: "Kushtia District Office" });
    await store.addJurisdiction(t.id, "Kushtia");

    expect(await store.resolveTenantIdForDistrict("Kushtia")).toBe(t.id);
    expect(await store.resolveTenantIdForDistrict("kushtia")).toBe(t.id); // case-insensitive
    expect(await store.resolveTenantIdForDistrict("Bogura")).toBe(HUB); // unclaimed -> hub
  });

  it("upazila-level jurisdiction wins over district-level", async () => {
    const a = await store.createTenant({ slug: "dist-a", name: "A" });
    const b = await store.createTenant({ slug: "dist-b", name: "B" });
    await store.addJurisdiction(a.id, "Kushtia");
    await store.addJurisdiction(b.id, "Kushtia", "Bheramara");

    expect(await store.resolveTenantIdForDistrict("Kushtia", "Bheramara")).toBe(b.id);
    expect(await store.resolveTenantIdForDistrict("Kushtia", "Kumarkhali")).toBe(a.id);
  });
});

describe("write access", () => {
  it("allows a tenant_admin member to write their tenant", async () => {
    const t = await store.createTenant({ slug: "dist-kushtia", name: "K" });
    await store.addMember(t.id, "user-1", "tenant_admin");
    await expect(assertTenantWriteAccess(store, "user-1", t.id)).resolves.toBeUndefined();
  });

  it("rejects a non-member", async () => {
    const t = await store.createTenant({ slug: "dist-kushtia", name: "K" });
    await expect(assertTenantWriteAccess(store, "stranger", t.id)).rejects.toThrow(TenantAccessError);
  });

  it("writing the hub requires hub_admin, not tenant_admin", async () => {
    await store.addMember(HUB, "user-2", "tenant_admin");
    await expect(assertTenantWriteAccess(store, "user-2", HUB)).rejects.toThrow(/hub_admin/);
    await store.addMember(HUB, "user-3", "hub_admin");
    await expect(assertTenantWriteAccess(store, "user-3", HUB)).resolves.toBeUndefined();
  });

  it("a tenant member cannot write another tenant (isolation)", async () => {
    const a = await store.createTenant({ slug: "dist-a", name: "A" });
    const b = await store.createTenant({ slug: "dist-b", name: "B" });
    await store.addMember(a.id, "user-a", "tenant_admin");
    await expect(assertTenantWriteAccess(store, "user-a", b.id)).rejects.toThrow(TenantAccessError);
  });
});
