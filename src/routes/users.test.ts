import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getDefaultAuthStore } from "../auth/store.js";

const app = createApp();

/** Signs up an admin and returns their bearer token + id. */
async function signInAdmin() {
  const res = await request(app).post("/auth/signup").send({
    name: "Admin User",
    email: "admin@ictfest.dev",
    password: "strong-pass-1",
  });
  return { token: res.body.accessToken as string, id: res.body.user.id as string };
}

describe("Admin Users API", () => {
  beforeEach(async () => {
    await getDefaultAuthStore().reset?.();
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/bearer/i);
  });

  it("rejects an invalid token", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("lists real auth users for an authenticated admin", async () => {
    const { token } = await signInAdmin();

    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      email: "admin@ictfest.dev",
      name: "Admin User",
      provider: "password",
      emailVerified: false,
    });
    // The password hash must never leak to the admin panel.
    expect(res.body[0].passwordHash).toBeUndefined();
  });

  it("creates a user and includes them in the list", async () => {
    const { token } = await signInAdmin();

    const created = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Grace Hopper", email: "Grace@Example.com", password: "strong-pass-2" });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: "Grace Hopper",
      email: "grace@example.com",
      provider: "password",
    });

    const list = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);
    expect(list.body).toHaveLength(2);
  });

  it("rejects a weak password and an invalid email", async () => {
    const { token } = await signInAdmin();
    const auth = { Authorization: `Bearer ${token}` };

    const weak = await request(app)
      .post("/api/users")
      .set(auth)
      .send({ name: "X", email: "x@example.com", password: "short" });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatch(/at least 8/i);

    const badEmail = await request(app)
      .post("/api/users")
      .set(auth)
      .send({ name: "X", email: "not-an-email", password: "strong-pass-1" });
    expect(badEmail.status).toBe(400);
  });

  it("rejects a duplicate email with 409", async () => {
    const { token } = await signInAdmin();

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Clone", email: "admin@ictfest.dev", password: "strong-pass-1" });

    expect(res.status).toBe(409);
  });

  it("deletes another user", async () => {
    const { token } = await signInAdmin();
    const auth = { Authorization: `Bearer ${token}` };

    const created = await request(app)
      .post("/api/users")
      .set(auth)
      .send({ name: "Temp", email: "temp@example.com", password: "strong-pass-1" });

    const del = await request(app).delete(`/api/users/${created.body.id}`).set(auth);
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/users/${created.body.id}`).set(auth);
    expect(after.status).toBe(404);
  });

  it("refuses to let an admin delete their own account", async () => {
    const { token, id } = await signInAdmin();

    const res = await request(app)
      .delete(`/api/users/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/your own account/i);
  });
});

describe("Admin Stats API", () => {
  beforeEach(async () => {
    await getDefaultAuthStore().reset?.();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/stats")).status).toBe(401);
  });

  it("reports real counts derived from the user store", async () => {
    const { token } = await signInAdmin();
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Second", email: "second@example.com", password: "strong-pass-1" });

    const res = await request(app).get("/api/stats").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.totalUsers).toBe(2);
    expect(res.body.passwordUsers).toBe(2);
    expect(res.body.oauthUsers).toBe(0);
    expect(res.body.recentSignups).toBe(2);
    expect(res.body.signupsByMonth).toHaveLength(12);
    // Both users were created now, so the trailing month holds them.
    expect(res.body.signupsByMonth.at(-1).count).toBe(2);
  });
});
