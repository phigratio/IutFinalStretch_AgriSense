import { describe, expect, it } from "vitest";
import { IntakeService } from "../agent/intakeService.js";
import { InMemoryIntakeStore } from "../agent/intakeStore.js";
import { type IntakeExtractor } from "../agent/extractIntakeProfile.js";
import { type IntakeProfile, type IntakeProfilePatch } from "../agent/intakeSchema.js";
import { AgriSenseService, type WeatherProvider } from "./agrisenseService.js";
import { InMemoryAgriSenseStore } from "./agrisenseStore.js";
import { SeededKnowledgeRetriever } from "./knowledgeRetriever.js";
import { mockWeatherForecast } from "./weatherTool.js";

class QueueExtractor implements IntakeExtractor {
  constructor(private readonly patches: IntakeProfilePatch[]) {}

  async extract(): Promise<IntakeProfilePatch> {
    return this.patches.shift() ?? {};
  }
}

class MockWeatherProvider implements WeatherProvider {
  async get(locationText: string) {
    return mockWeatherForecast(locationText);
  }
}

function buildService(patches: IntakeProfilePatch[]) {
  return new AgriSenseService(
    new IntakeService(new InMemoryIntakeStore(), new QueueExtractor(patches)),
    new InMemoryAgriSenseStore(),
    new MockWeatherProvider(),
    new SeededKnowledgeRetriever(),
  );
}

describe("AgriSenseService", () => {
  it("stops at targeted follow-up when intake is incomplete", async () => {
    const service = buildService([{ locationText: "Gazipur", sizeAcres: 2 }]);

    const result = await service.handleMessage({ message: "I have 2 acres in Gazipur" });

    expect(result.missingFields).toEqual(["soilType", "waterAvailability", "budget", "targetSeason"]);
    expect(result.weather).toBeUndefined();
    expect(result.cropRankings).toBeUndefined();
    expect(result.trace.map((event) => event.toolName)).not.toContain("weather.fetch");
  });

  it("runs weather, crop ranking, plan, and finance after intake is complete", async () => {
    const service = buildService([
      {
        locationText: "Gazipur",
        sizeAcres: 2,
        soilType: "sandy loam",
        waterAvailability: "rainfed",
        budgetBdt: 45000,
        targetSeason: "Aman",
      },
    ]);

    const result = await service.handleMessage({
      message: "2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman",
    });

    expect(result.missingFields).toEqual([]);
    expect(result.weather?.daily).toHaveLength(7);
    expect(result.cropRankings).toHaveLength(3);
    expect(result.seasonPlan?.tasks.length).toBeGreaterThanOrEqual(6);
    expect(result.seasonPlan?.financials.netProfitBdt).toBeTypeOf("number");
    expect(result.seasonPlan?.financials.costBreakdown.length).toBeGreaterThanOrEqual(7);
    expect(result.seasonPlan?.financials.netProfitBdt).toBe(
      result.seasonPlan!.financials.expectedRevenueBdt - result.seasonPlan!.financials.totalCostBdt,
    );
    expect(result.retrievedEvidence?.length).toBeGreaterThan(0);
    expect(result.seasonPlan?.sourceTraceIds.length).toBeGreaterThan(0);
    expect(result.trace.map((event) => event.toolName)).toEqual(
      expect.arrayContaining([
        "agent.plan",
        "weather.fetch",
        "rag.retrieve",
        "crop.rank",
        "crop.select",
        "season.plan",
        "finance.calculate",
        "explanation.generate",
      ]),
    );
  });

  it("can stop at a requested workflow stage and resume later", async () => {
    const service = buildService([
      {
        locationText: "Gazipur",
        sizeAcres: 2,
        soilType: "sandy loam",
        waterAvailability: "rainfed",
        budgetBdt: 45000,
        targetSeason: "Aman",
      },
    ]);

    const weatherOnly = await service.handleMessage({
      message: "2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman",
      workflowStage: "weather",
    });

    expect(weatherOnly.workflowStage).toBe("weather");
    expect(weatherOnly.weather?.daily).toHaveLength(7);
    expect(weatherOnly.retrievedEvidence).toBeUndefined();
    expect(weatherOnly.cropRankings).toBeUndefined();
    expect(weatherOnly.seasonPlan).toBeUndefined();
    expect(weatherOnly.trace.map((event) => event.toolName)).not.toContain("rag.retrieve");

    const cropOnly = await service.handleMessage({
      message: "continue from crop ranking",
      sessionId: weatherOnly.sessionId,
      farmerId: weatherOnly.farmerId,
      farmId: weatherOnly.farmId,
      workflowStage: "crop_ranking",
    });

    expect(cropOnly.workflowStage).toBe("crop_ranking");
    expect(cropOnly.weather?.daily).toHaveLength(7);
    expect(cropOnly.retrievedEvidence?.length).toBeGreaterThan(0);
    expect(cropOnly.cropRankings).toHaveLength(3);
    expect(cropOnly.seasonPlan).toBeUndefined();
    expect(cropOnly.trace.map((event) => event.toolName)).toContain("crop.rank");
    expect(cropOnly.trace.map((event) => event.toolName)).not.toContain("season.plan");
  });

  it("honors an explicit selected crop when it is in the ranked candidates", async () => {
    const service = buildService([
      {
        locationText: "Gazipur",
        sizeAcres: 2,
        soilType: "sandy loam",
        waterAvailability: "rainfed",
        budgetBdt: 45000,
        targetSeason: "Aman",
      },
    ]);

    const result = await service.handleMessage({
      message: "2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman, choose maize",
      selectedCrop: "maize",
      triggerReason: "crop_selected",
    });

    expect(result.seasonPlan?.crop).toBe("maize");
    expect(result.seasonPlan?.automationTrigger).toBe("crop_selected");
    expect(result.seasonPlan?.selectedCropReason).toContain("explicitly requested");
  });
});
