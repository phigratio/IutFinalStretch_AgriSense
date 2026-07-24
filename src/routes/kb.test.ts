import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { setKbRuntime } from "../kb/runtime.js";
import { InMemoryPriceStore } from "../kb/priceStore.js";
import { InMemoryTenantStore, HUB } from "../kb/tenancy.js";
import type { IngestedPrice } from "../kb/ingest/wfpPrices.js";

const app = createApp();
let priceStore: InMemoryPriceStore;
let tenantStore: InMemoryTenantStore;

const fakeHubPrices: IngestedPrice[] = [
  {
    tenantId: "hub", cropId: "rice_t_aman", commodityLabel: "Rice (coarse)", district: "Kushtia",
    market: "Kushtia Sadar", latitude: 23.9, longitude: 89.12, price: 54, unit: "kg",
    priceType: "retail", currency: "BDT", observedAt: "2026-05-15", source: "WFP/HDX",
    sourceUrl: "http://x", dataOrigin: "real", verification: "cross_checked",
  },
];

beforeEach(async () => {
  priceStore = new InMemoryPriceStore();
  tenantStore = new InMemoryTenantStore();
  setKbRuntime({
    priceStore,
    tenantStore,
    ingestHubPrices: async () => fakeHubPrices,
  });
  // A tenant covering Kushtia + members.
  const t = await tenantStore.createTenant({ slug: "dist-kushtia", name: "Kushtia Office" });
  await tenantStore.addJurisdiction("dist-kushtia", "Kushtia");
  await tenantStore.addMember("dist-kushtia", "u-tenant", "tenant_admin");
  await tenantStore.addMember(HUB, "u-hub", "hub_admin");
  void t;
});

describe("POST /api/kb/hub/prices/refresh", () => {
  it("requires hub_admin", async () => {
    const res = await request(app).post("/api/kb/hub/prices/refresh").set("x-user-id", "u-tenant");
    expect(res.status).toBe(403);
  });

  it("imports hub prices for a hub_admin", async () => {
    const res = await request(app).post("/api/kb/hub/prices/refresh").set("x-user-id", "u-hub");
    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.byCrop.rice_t_aman).toBe(1);
  });
});

describe("GET /api/kb/prices", () => {
  it("resolves the hub price with provenance", async () => {
    await priceStore.addObservations(fakeHubPrices);
    const res = await request(app).get("/api/kb/prices?cropId=rice_t_aman&district=Kushtia");
    expect(res.status).toBe(200);
    expect(res.body.pricePerKg).toBe(54);
    expect(res.body.provenance.basis).toBe("hub_district");
    expect(res.body.provenance.source).toBe("WFP/HDX");
  });

  it("404s (no invention) when no price exists", async () => {
    const res = await request(app).get("/api/kb/prices?cropId=maize&district=Kushtia");
    expect(res.status).toBe(404);
  });
});

describe("tenant price overrides hub", () => {
  it("a tenant_admin posts a fresher local price and the resolver prefers it", async () => {
    await priceStore.addObservations(fakeHubPrices); // hub 54

    const post = await request(app)
      .post("/api/kb/tenants/dist-kushtia/prices")
      .set("x-user-id", "u-tenant")
      .send({ cropId: "rice_t_aman", district: "Kushtia", price: 58, unit: "kg", observedAt: "2026-07-24" });
    expect(post.status).toBe(201);

    const res = await request(app).get("/api/kb/prices?cropId=rice_t_aman&district=Kushtia");
    expect(res.body.pricePerKg).toBe(58);
    expect(res.body.provenance.basis).toBe("local");
    expect(res.body.provenance.tenantId).toBe("dist-kushtia");
  });

  it("a non-member cannot post tenant prices", async () => {
    const res = await request(app)
      .post("/api/kb/tenants/dist-kushtia/prices")
      .set("x-user-id", "stranger")
      .send({ cropId: "rice_t_aman", price: 58, unit: "kg" });
    expect(res.status).toBe(403);
  });
});
