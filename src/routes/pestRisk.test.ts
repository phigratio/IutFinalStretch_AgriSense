import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createPestRiskRouter } from "./pestRisk.js";
import { InMemoryPestRiskStore, PestRiskService, type PestWeatherProvider } from "../pest/pestRiskService.js";
import type { WeatherForecast } from "../agrisense/types.js";

class MockWeatherProvider implements PestWeatherProvider {
  async get(locationText: string): Promise<WeatherForecast> {
    return {
      provider: "mock",
      locationText,
      latitude: 23.99,
      longitude: 90.42,
      daily: [0, 1, 2, 0, 1, 0, 2].map((rainfallMm, index) => ({
        date: `2026-07-${String(24 + index).padStart(2, "0")}`,
        rainfallMm,
        temperatureMinC: 22,
        temperatureMaxC: 29,
        humidityPct: 93,
      })),
      raw: { test: true },
    };
  }
}

function makeApp(store = new InMemoryPestRiskStore()) {
  const app = express();
  app.use(express.json());
  app.use("/api/pest-risk", createPestRiskRouter(new PestRiskService(store, new MockWeatherProvider())));
  return { app, store };
}

describe("/api/pest-risk", () => {
  it("assesses and saves a high rice disease risk", async () => {
    const { app, store } = makeApp();

    const res = await request(app)
      .post("/api/pest-risk/assess")
      .send({
        cropId: "rice_t_aman",
        growthStage: "tillering",
        daysAfterSowing: 35,
        areaAcres: 2,
        locationText: "Gazipur",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.assessment.highestSeverity).toBe("high");
    expect(res.body.assessment.risks[0].prevention.estimatedCostBdt).toBeGreaterThan(0);
    expect(res.body.trace.map((event: { toolName: string }) => event.toolName)).toEqual(
      expect.arrayContaining(["pest.weather.fetch", "pest.rule.evaluate", "pest.assessment.save"]),
    );
    expect(store.assessments).toHaveLength(1);
    expect(store.alerts.length).toBeGreaterThan(0);
  });

  it("lists and fetches saved assessment detail", async () => {
    const { app } = makeApp();

    const created = await request(app)
      .post("/api/pest-risk/assess")
      .send({
        cropId: "rice_t_aman",
        growthStage: "tillering",
        daysAfterSowing: 35,
        areaAcres: 2,
        locationText: "Gazipur",
      });

    const list = await request(app).get("/api/pest-risk/assessments");
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body[0].id).toBe(created.body.savedAssessmentId);

    const detail = await request(app).get(`/api/pest-risk/assessments/${created.body.savedAssessmentId}`);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(detail.body.risks[0].prevention.text.length).toBeGreaterThan(20);
    expect(detail.body.trace.map((event: { toolName: string }) => event.toolName)).toContain("pest.rule.evaluate");
  });

  it("400s when crop or location is missing", async () => {
    const { app } = makeApp();
    const missingCrop = await request(app).post("/api/pest-risk/assess").send({ locationText: "Gazipur" });
    expect(missingCrop.status).toBe(400);

    const missingLocation = await request(app).post("/api/pest-risk/assess").send({ cropId: "potato" });
    expect(missingLocation.status).toBe(400);
  });
});
