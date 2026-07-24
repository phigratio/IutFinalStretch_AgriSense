import { describe, expect, it } from "vitest";
import { type IntakeProfile } from "../agent/intakeSchema.js";
import { mockWeatherForecast } from "./weatherTool.js";
import { buildSeasonPlan, rankCrops, selectCrop } from "./planningEngine.js";
import { extractScenarioDeltas, simulateScenario } from "./scenarioEngine.js";

const profile: IntakeProfile = {
  sessionId: "session-1",
  farmerId: "farmer-1",
  farmId: "farm-1",
  locationText: "Gazipur",
  sizeAcres: 2,
  soilType: "sandy loam",
  waterAvailability: "rainfed",
  budgetBdt: 45000,
  targetSeason: "Aman",
};

function baseline() {
  const weather = mockWeatherForecast("Gazipur");
  const cropRankings = rankCrops(profile, weather, []);
  const selected = selectCrop(cropRankings, "rice");
  const seasonPlan = buildSeasonPlan(profile, weather, selected.crop, {
    selectedCropReason: selected.reason,
    retrievedEvidence: [],
  });
  return { farmProfile: profile, weather, cropRankings, seasonPlan };
}

function rain7dMm(weather: ReturnType<typeof mockWeatherForecast>) {
  return weather.daily.slice(0, 7).reduce((sum, day) => sum + day.rainfallMm, 0);
}

describe("scenarioEngine", () => {
  it("extracts English and Banglish rainfall/budget scenarios", () => {
    expect(extractScenarioDeltas("What if rainfall drops 30%?")).toMatchObject({ rainfallPct: -30 });
    expect(extractScenarioDeltas("budget 40% kom hole ki hobe?")).toMatchObject({ budgetPct: -40 });
  });

  it("simulates rainfall stress with changed weather, irrigation, and profit", () => {
    const result = simulateScenario({
      message: "What if rainfall drops 30%?",
      baseline: baseline(),
    });

    expect(result.deltas.rainfallPct).toBe(-30);
    expect(rain7dMm(result.scenario.weather)).toBeLessThan(rain7dMm(result.baseline.weather));
    expect(result.comparison.irrigationEvents).toBeGreaterThanOrEqual(1);
    expect(result.scenario.seasonPlan.financials.totalCostBdt).toBeGreaterThan(result.baseline.seasonPlan.financials.totalCostBdt);
    expect(result.scenario.seasonPlan.financials.netProfitBdt).not.toBe(result.baseline.seasonPlan.financials.netProfitBdt);
    expect(result.trace.map((event) => event.toolName)).toEqual(
      expect.arrayContaining(["scenario.extract", "scenario.patch_inputs", "scenario.recalculate", "scenario.compare"]),
    );
  });

  it("simulates a budget cut without mutating the baseline", () => {
    const base = baseline();
    const result = simulateScenario({
      message: "What if my budget is cut 40%?",
      baseline: base,
    });

    expect(result.scenario.farmProfile.budgetBdt).toBe(27000);
    expect(base.farmProfile.budgetBdt).toBe(45000);
    expect(result.scenario.seasonPlan.financials.budgetSurplusBdt).toBeLessThan(result.baseline.seasonPlan.financials.budgetSurplusBdt);
  });
});
