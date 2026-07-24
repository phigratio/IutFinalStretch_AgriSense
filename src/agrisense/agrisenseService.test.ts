import { describe, expect, it } from "vitest";
import { IntakeService } from "../agent/intakeService.js";
import { InMemoryIntakeStore } from "../agent/intakeStore.js";
import { type IntakeExtractor } from "../agent/extractIntakeProfile.js";
import { type IntakeProfile, type IntakeProfilePatch } from "../agent/intakeSchema.js";
import { AgriSenseService, type WeatherProvider } from "./agrisenseService.js";
import { InMemoryAgriSenseStore } from "./agrisenseStore.js";
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
    expect(result.trace.map((event) => event.toolName)).toEqual(
      expect.arrayContaining([
        "agent.plan",
        "weather.fetch",
        "rag.retrieve.placeholder",
        "crop.rank",
        "plan.generate",
        "finance.calculate",
      ]),
    );
  });
});

