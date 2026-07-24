/**
 * HTTP tests for /api/payments — router wired with explicit offline deps
 * (mock bdapps + in-memory stores), so no env vars or DB are needed.
 */
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createPaymentsRouter } from "./payments.js";
import { InMemoryPaymentStore } from "../payments/store.js";
import { MockBdappsClient } from "../bdapps/mock.js";
import { InMemoryAgriSenseStore } from "../agrisense/agrisenseStore.js";

function makeApp() {
  const deps = {
    bdapps: new MockBdappsClient(),
    payments: new InMemoryPaymentStore(),
    trace: new InMemoryAgriSenseStore(),
  };
  const app = express();
  app.use(express.json());
  app.use("/api/payments", createPaymentsRouter(deps));
  return { app, deps };
}

describe("POST /api/payments/checkout", () => {
  it("returns a successful checkout result", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/payments/checkout")
      .send({ mobile: "01812345678", amountBdt: 45, description: "50kg urea" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.status).toBe("success");
    expect(res.body.internalTrxId).toBeTruthy();
    expect(res.body.mock).toBe(true);
  });

  it("returns ok:false insufficient as a 200 domain outcome", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/payments/checkout")
      .send({ mobile: "01812345678", amountBdt: 9999 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.status).toBe("insufficient");
    expect(res.body.statusCode).toBe("E1326");
  });

  it("400s on missing mobile and non-positive amount", async () => {
    const { app } = makeApp();
    expect((await request(app).post("/api/payments/checkout").send({ amountBdt: 5 })).status).toBe(400);
    expect(
      (await request(app).post("/api/payments/checkout").send({ mobile: "01812345678", amountBdt: 0 })).status,
    ).toBe(400);
  });
});

describe("GET /api/payments/:id", () => {
  it("reads back a persisted receipt and 404s on unknown ids", async () => {
    const { app } = makeApp();
    const paid = await request(app)
      .post("/api/payments/checkout")
      .send({ mobile: "01812345678", amountBdt: 20 });

    const read = await request(app).get(`/api/payments/${paid.body.paymentId}`);
    expect(read.status).toBe(200);
    expect(read.body.status).toBe("success");
    expect(read.body.receiptNumber).toBe(paid.body.internalTrxId);

    expect((await request(app).get("/api/payments/does-not-exist")).status).toBe(404);
  });
});
