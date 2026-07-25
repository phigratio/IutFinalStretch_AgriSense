import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { getDefaultAuthStore } from "../auth/store.js";

const app = createApp();

describe("Auth API", () => {
  beforeEach(async () => {
    await getDefaultAuthStore().reset?.();
  });

  it("signs up a user and returns a bearer token", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "Ada Lovelace", email: "Ada@Example.com", password: "strong-pass-1" });

    expect(res.status).toBe(201);
    expect(res.body.tokenType).toBe("Bearer");
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.user).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      emailVerified: false,
    });
    expect(res.body.user.id).toBeTypeOf("string");
  });

  it("rejects duplicate signup emails", async () => {
    await request(app)
      .post("/auth/signup")
      .send({ name: "Ada", email: "ada@example.com", password: "strong-pass-1" });

    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "Ada 2", email: "ADA@example.com", password: "strong-pass-1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it("logs in and reads the current user with the bearer token", async () => {
    await request(app)
      .post("/auth/signup")
      .send({ name: "Grace Hopper", email: "grace@example.com", password: "strong-pass-1" });

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "grace@example.com", password: "strong-pass-1" });

    expect(login.status).toBe(200);

    const me = await request(app)
      .get("/auth/me")
      .set("authorization", `Bearer ${login.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ name: "Grace Hopper", email: "grace@example.com" });
  });

  it("rejects invalid login credentials", async () => {
    await request(app)
      .post("/auth/signup")
      .send({ name: "Linus", email: "linus@example.com", password: "strong-pass-1" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "linus@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it("requires a bearer token for /auth/me", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/bearer/i);
  });
});
