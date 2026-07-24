import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { setAgentRuntime } from "./agent.js";
import { getDefaultAgentStore } from "../agent/sessionStore.js";
import { HeuristicExtractor } from "../llm/provider.js";
import type { ForecastResult, NormalsResult, GeocodeResult } from "../tools/weather.js";

const fakeGeocode = async (): Promise<GeocodeResult> => ({
  lat: 23.9,
  lon: 89.1,
  matchedName: "Kushtia",
  admin1: "Khulna",
  sourceUrl: "x",
  retrievedAt: "ts",
});
const fakeForecast = async (): Promise<ForecastResult> => ({
  daily: [{ date: "2026-12-20", rainMm: 2, tminC: 14, tmaxC: 26 }],
  totalRainNext7Mm: 8,
  totalRainNext16Mm: 12,
  tmeanNext7C: 20,
  sourceUrl: "x",
  retrievedAt: "ts",
  stale: false,
});
const fakeNormals = async (): Promise<NormalsResult> => ({
  monthly: [{ month: 12, avgRainMm: 10, avgTminC: 13, avgTmaxC: 26 }],
  yearsUsed: "2016–2025",
  sourceUrl: "x",
  retrievedAt: "ts",
  stale: true,
});

describe("POST /api/tier0/agent/message", () => {
  const app = createApp();

  beforeEach(() => {
    getDefaultAgentStore().reset();
    setAgentRuntime({
      extractor: new HeuristicExtractor(),
      geocode: fakeGeocode,
      getForecast: fakeForecast,
      getNormals: fakeNormals,
      resolvePrice: async () => null, // CSV baseline; no DB/network in tests
      queryKb: async () => [], // no mem0 in tests
    });
  });

  it("asks for missing fields on a vague opener (A3)", async () => {
    const res = await request(app).post("/api/tier0/agent/message").send({ message: "I want to plant something" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("intake");
    expect(res.body.missingFields.length).toBeGreaterThan(0);
    expect(res.body.reply).toMatch(/\?/);
  });

  it("drives a full turn to a recommendation with traceable numbers", async () => {
    const msg =
      "I'm in Kushtia with 2 acres of loam soil, reliable irrigation, budget 120000, planning Boro";
    const res = await request(app).post("/api/tier0/agent/message").send({ message: msg });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.chosen.cropId).toBeTruthy();
    expect(res.body.topCandidates.length).toBeGreaterThanOrEqual(3);
    expect(res.body.financials.totalCostBdt).toBeGreaterThan(0);
    expect(res.body.reply).toMatch(/Recommendation basis:/);

    // trace endpoint returns the tool calls for this session
    const trace = await request(app).get(`/api/tier0/sessions/${res.body.sessionId}/trace`);
    expect(trace.status).toBe(200);
    const tools = trace.body.events.map((e: { toolName: string }) => e.toolName);
    expect(tools).toContain("get_forecast");
    expect(tools).toContain("compute_financials");
  });

  it("remembers state across turns and never re-asks a known field (A4)", async () => {
    const first = await request(app).post("/api/tier0/agent/message").send({ message: "My farm is in Kushtia" });
    expect(first.body.status).toBe("intake");
    expect(first.body.missingFields).not.toContain("district");

    const second = await request(app)
      .post("/api/tier0/agent/message")
      .send({ sessionId: first.body.sessionId, message: "2 acres, loam, reliable irrigation, budget 120000, Boro" });
    expect(second.body.status).toBe("complete");
  });

  it("400s when message is missing", async () => {
    const res = await request(app).post("/api/tier0/agent/message").send({});
    expect(res.status).toBe(400);
  });

  it("404s trace for an unknown session", async () => {
    const res = await request(app).get("/api/tier0/sessions/does-not-exist/trace");
    expect(res.status).toBe(404);
  });
});
