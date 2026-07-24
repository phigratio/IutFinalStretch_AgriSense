import { describe, it, expect, beforeEach } from "vitest";
import { runPipeline, seasonFittingCrops, type OrchestratorProfile } from "./orchestrator.js";
import { InMemoryTraceWriter } from "../tools/trace.js";
import { WeatherUnavailableError, type ForecastResult, type NormalsResult } from "../tools/weather.js";
import { resolveCrop } from "../data/crops.js";

const profile = (): OrchestratorProfile => ({
  locationText: "Kushtia",
  district: "Kushtia",
  lat: 23.9,
  lon: 89.1,
  areaValue: 2,
  areaUnit: "acre",
  areaHa: 0.81,
  soilTexture: "loam",
  fertilityClass: "medium",
  fertilitySource: "srdi_default",
  waterAvailability: "reliable_irrigation",
  budgetBdt: 120000,
  targetSeason: "boro",
});

const fakeForecast = (): ForecastResult => ({
  daily: [
    { date: "2026-12-20", rainMm: 2, tminC: 14, tmaxC: 26 },
    { date: "2026-12-21", rainMm: 0, tminC: 13, tmaxC: 25 },
  ],
  totalRainNext7Mm: 8,
  totalRainNext16Mm: 12,
  tmeanNext7C: 20,
  sourceUrl: "x",
  retrievedAt: "2026-07-24T00:00:00Z",
  stale: false,
});

const fakeNormals = (): NormalsResult => ({
  monthly: [{ month: 12, avgRainMm: 10, avgTminC: 13, avgTmaxC: 26 }],
  yearsUsed: "2016–2025",
  sourceUrl: "x",
  retrievedAt: "2026-07-24T00:00:00Z",
  stale: true,
});

let writer: InMemoryTraceWriter;
beforeEach(() => {
  writer = new InMemoryTraceWriter();
});

describe("orchestrator happy path", () => {
  it("produces ranking, a chosen crop, plan, financials and a basis block", async () => {
    const r = await runPipeline(profile(), {
      writer,
      getForecast: async () => fakeForecast(),
      getNormals: async () => fakeNormals(),
    });
    expect(r.ranking.length).toBe(8);
    expect(r.chosen.recommended).toBe(true);
    expect(r.plan.tasks.length).toBeGreaterThan(0);
    expect(r.financials.totalCostBdt).toBeGreaterThan(0);
    expect(r.basis).toMatch(/Recommendation basis:/);
    expect(r.weatherAvailable).toBe(true);
  });
});

describe("G5: every number in the output maps to a trace step_id", () => {
  it("all provenance entries reference a real trace event", async () => {
    const r = await runPipeline(profile(), {
      writer,
      getForecast: async () => fakeForecast(),
      getNormals: async () => fakeNormals(),
    });

    const stepIds = new Set(writer.events.map((e) => e.stepId));
    expect(r.numbers.length).toBeGreaterThan(0);
    for (const n of r.numbers) {
      expect(stepIds.has(n.stepId), `${n.label} -> ${n.stepId} missing from trace`).toBe(true);
    }

    // the headline financial numbers must all be represented
    const labels = new Set(r.numbers.map((n) => n.label));
    for (const key of ["totalCostBdt", "grossRevenueBdt", "netProfitBdt", "roiPercent"]) {
      expect(labels.has(key), `missing provenance for ${key}`).toBe(true);
    }

    // trace must include one event per pipeline tool
    const tools = new Set(writer.events.map((e) => e.toolName));
    for (const t of ["get_forecast", "get_climate_normals", "rank_crops", "build_season_plan", "compute_financials"]) {
      expect(tools.has(t), `no trace event for ${t}`).toBe(true);
    }
  });
});

describe("G4: missing information is handled honestly", () => {
  it("unknown crop resolves to null and is never invented; KB offers real candidates", () => {
    expect(resolveCrop("dragonfruit").cropId).toBeNull();
    const boroCrops = seasonFittingCrops("boro");
    expect(boroCrops).toContain("rice_boro");
    expect(boroCrops.every((c) => typeof c === "string")).toBe(true);
  });

  it("weather failure: no invented rainfall, failure visible in trace, pipeline still completes", async () => {
    const r = await runPipeline(profile(), {
      writer,
      getForecast: async () => {
        throw new WeatherUnavailableError("network down");
      },
      getNormals: async () => fakeNormals(),
    });

    // the failed call is in the trace as an error, and nothing about it is invented
    const forecastEvents = writer.events.filter((e) => e.toolName === "get_forecast");
    expect(forecastEvents).toHaveLength(1);
    expect(forecastEvents[0].status).toBe("error");
    expect(r.weatherAvailable).toBe(false);

    // no forecast-derived numbers, but the pipeline still produced real financials
    expect(r.numbers.some((n) => n.label === "totalRainNext7Mm")).toBe(false);
    expect(Number.isFinite(r.financials.netProfitBdt)).toBe(true);
    expect(r.basis).toMatch(/forecast unavailable/i);
  });

  it("an off-KB chosen crop falls back to the top-ranked recommendation", async () => {
    const r = await runPipeline(profile(), {
      writer,
      getForecast: async () => fakeForecast(),
      getNormals: async () => fakeNormals(),
      chosenCropId: "dragonfruit",
    });
    expect(r.chosen.recommended).toBe(true); // fell back, so it's our recommendation
    expect(r.ranking.some((c) => c.cropId === r.chosen.cropId)).toBe(true);
  });

  it("attaches KB citations to the basis and traces the retrieval (K3-4)", async () => {
    const r = await runPipeline(profile(), {
      writer,
      getForecast: async () => fakeForecast(),
      getNormals: async () => fakeNormals(),
      queryKb: async (_q, cropId) => [
        { citation: `[KB:BRRI RKB p.7] (${cropId})`, text: "manage blast..." },
      ],
    });
    expect(r.kbCitations).toContain("[KB:BRRI RKB p.7] (rice_boro)");
    expect(r.basis).toMatch(/Knowledge base:/);
    expect(writer.events.some((e) => e.toolName === "query_knowledge_base")).toBe(true);
  });

  it("uses an injected KB price and traces its provenance (K1-7)", async () => {
    // A very high boro price so KB clearly drives revenue vs the CSV baseline.
    const r = await runPipeline(profile(), {
      writer,
      getForecast: async () => fakeForecast(),
      getNormals: async () => fakeNormals(),
      resolvePrice: async (cropId) =>
        cropId === "rice_boro"
          ? { pricePerKg: 200, provenance: { source: "tenant:dist-kushtia", basis: "local" } }
          : null,
    });
    // boro (target season = boro) is chosen; revenue reflects the 200 BDT/kg KB price.
    expect(r.chosen.cropId).toBe("rice_boro");
    expect(r.financials.grossRevenueBdt).toBeCloseTo(r.financials.expectedYieldKg * 200, 2);
    // the resolved price is traceable
    const priceNum = r.numbers.find((n) => n.label === "priceBdtPerKg");
    expect(priceNum?.value).toBe(200);
    expect(writer.events.some((e) => e.toolName === "resolve_prices" && e.stepId === priceNum?.stepId)).toBe(true);
  });
});
