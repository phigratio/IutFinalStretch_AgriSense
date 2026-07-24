import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { setOnboardingRuntime } from "./onboarding.js";
import { InMemoryOnboardingStore } from "../onboarding/store.js";
import { InMemoryAuthStore } from "../auth/store.js";
import { createAuthToken } from "../auth/tokens.js";

const app = createApp();
let onboarding: InMemoryOnboardingStore;
let auth: InMemoryAuthStore;

const bearer = (userId: string, role: "user" | "tenant" | "admin") =>
  `Bearer ${createAuthToken({ userId, email: `${userId}@x.test`, role })}`;

async function makeUser(name: string): Promise<string> {
  const u = await auth.createPasswordUser({ email: `${name}@x.test`, name, passwordHash: "x" });
  return u.id;
}

beforeEach(() => {
  onboarding = new InMemoryOnboardingStore();
  auth = new InMemoryAuthStore();
  setOnboardingRuntime({ onboarding, auth });
});

describe("onboarding — everyone starts as user", () => {
  it("GET /onboarding/me reports role=user and no profile initially", async () => {
    const uid = await makeUser("farmer1");
    const res = await request(app).get("/api/onboarding/me").set("authorization", bearer(uid, "user"));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("user");
    expect(res.body.onboarding).toBeNull();
    expect(res.body.profileComplete).toBe(false);
    expect(res.body.missingFields).toContain("farmSizeDecimals");
    expect(res.body.tenantRequest).toBeNull();
    expect(res.body.assistRequest).toBeNull();
  });

  it("rejects unauthenticated access", async () => {
    expect((await request(app).get("/api/onboarding/me")).status).toBe(401);
  });
});

describe("choice A — request to become a tenant (admin decides)", () => {
  it("user submits a request; admin approves -> user becomes a tenant", async () => {
    const uid = await makeUser("agro");
    const adminId = await makeUser("admin");

    const reqRes = await request(app)
      .post("/api/onboarding/tenant-request")
      .set("authorization", bearer(uid, "user"))
      .send({ orgName: "Kushtia Agri Office", district: "Kushtia", phone: "01700000001" });
    expect(reqRes.status).toBe(201);
    const reqId = reqRes.body.id;

    const pendingMe = await request(app).get("/api/onboarding/me").set("authorization", bearer(uid, "user"));
    expect(pendingMe.body.tenantRequest.status).toBe("pending");
    expect(pendingMe.body.tenantRequest.phone).toBe("01700000001");

    // a non-admin cannot list requests
    const forbidden = await request(app).get("/api/admin/tenant-requests").set("authorization", bearer(uid, "user"));
    expect(forbidden.status).toBe(403);

    const approve = await request(app)
      .post(`/api/admin/tenant-requests/${reqId}/approve`)
      .set("authorization", bearer(adminId, "admin"));
    expect(approve.status).toBe(200);
    expect(approve.body.tenantSlug).toMatch(/kushtia-agri-office/);

    // the requesting user's role is now tenant
    const me = await request(app).get("/api/onboarding/me").set("authorization", bearer(uid, "user"));
    expect(me.body.role).toBe("tenant");
    expect(me.body.tenantRequest.status).toBe("approved");

    // The original user-role token remains usable after approval because tenant access
    // is checked against the current database role rather than the stale JWT claim.
    const tenantQueue = await request(app).get("/api/tenant/assist-requests").set("authorization", bearer(uid, "user"));
    expect(tenantQueue.status).toBe(200);
  });
});

describe("choice B — fill your own profile", () => {
  it("saves a self-filled farmer profile", async () => {
    const uid = await makeUser("selffarmer");
    const res = await request(app)
      .post("/api/onboarding/profile")
      .set("authorization", bearer(uid, "user"))
      .send({ district: "Bogura", fullName: "Karim", phone: "01700000000", farmSizeDecimals: 200, soilTexture: "loam", waterAvailability: "reliable_irrigation", budgetBdt: 50000, targetSeason: "rabi" });
    expect(res.status).toBe(201);
    expect(res.body.filledBy).toBe("self");

    const me = await request(app).get("/api/onboarding/me").set("authorization", bearer(uid, "user"));
    expect(me.body.onboarding.district).toBe("Bogura");
    expect(me.body.onboarding.fullName).toBe("Karim");
    expect(me.body.profileComplete).toBe(true);
    expect(me.body.missingFields).toEqual([]);
  });
});

describe("choice C — ask a tenant to fill the profile", () => {
  it("user requests assistance; a tenant fulfils it on their behalf", async () => {
    const farmerId = await makeUser("lowlit");
    const tenantId = await makeUser("tenantadmin");
    await auth.setUserRole(tenantId, "tenant");

    const assist = await request(app)
      .post("/api/onboarding/assist-request")
      .set("authorization", bearer(farmerId, "user"))
      .send({ district: "Kushtia", fullName: "Rahima", phone: "017..." });
    expect(assist.status).toBe(201);
    const assistId = assist.body.id;

    const waiting = await request(app).get("/api/onboarding/me").set("authorization", bearer(farmerId, "user"));
    expect(waiting.body.assistRequest.status).toBe("pending");
    expect(waiting.body.profileComplete).toBe(false);

    // tenant sees the pending request in the district
    const list = await request(app)
      .get("/api/tenant/assist-requests?district=Kushtia")
      .set("authorization", bearer(tenantId, "tenant"));
    expect(list.status).toBe(200);
    expect(list.body.some((r: { id: string }) => r.id === assistId)).toBe(true);

    // a plain user cannot access the tenant queue
    const forbidden = await request(app).get("/api/tenant/assist-requests").set("authorization", bearer(farmerId, "user"));
    expect(forbidden.status).toBe(403);

    // tenant fulfils it -> the farmer's profile is created, filledBy=tenant
    const fulfil = await request(app)
      .post(`/api/tenant/assist-requests/${assistId}/fulfill`)
      .set("authorization", bearer(tenantId, "tenant"))
      .send({ farmSizeDecimals: 120, soilTexture: "clay", waterAvailability: "reliable_irrigation", budgetBdt: 90000, targetSeason: "boro" });
    expect(fulfil.status).toBe(200);
    expect(fulfil.body.onboarding.filledBy).toBe("tenant");

    const me = await request(app).get("/api/onboarding/me").set("authorization", bearer(farmerId, "user"));
    expect(me.body.onboarding.soilTexture).toBe("clay");
    expect(me.body.onboarding.filledByUserId).toBe(tenantId);
    expect(me.body.profileComplete).toBe(true);
    expect(me.body.assistRequest.status).toBe("fulfilled");
  });
});

describe("admin can set roles directly", () => {
  it("promotes a user to admin", async () => {
    const target = await makeUser("promote");
    const adminId = await makeUser("root");
    const res = await request(app)
      .post(`/api/admin/users/${target}/role`)
      .set("authorization", bearer(adminId, "admin"))
      .send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });
});
