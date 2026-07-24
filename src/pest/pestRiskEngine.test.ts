import { describe, expect, it } from "vitest";
import { assessPestDiseaseRisk } from "./pestRiskEngine.js";
import type { WeatherForecast } from "../agrisense/types.js";

function weather(input: {
  rain: number[];
  min?: number;
  max?: number;
  humidity?: number;
}): WeatherForecast {
  return {
    provider: "mock",
    locationText: "Bogura, Bangladesh",
    latitude: 24.85,
    longitude: 89.37,
    daily: input.rain.map((rainfallMm, index) => ({
      date: `2026-07-${String(24 + index).padStart(2, "0")}`,
      rainfallMm,
      temperatureMinC: input.min ?? 24,
      temperatureMaxC: input.max ?? 30,
      humidityPct: input.humidity ?? 92,
    })),
    raw: { test: true },
  };
}

describe("pest risk engine", () => {
  it("flags rice blast under humid suitable weather", () => {
    const result = assessPestDiseaseRisk({
      cropId: "rice_t_aman",
      growthStage: "tillering",
      daysAfterSowing: 35,
      areaAcres: 2,
      weather: weather({ rain: [1, 2, 1, 0, 1, 2, 0], min: 22, max: 29, humidity: 93 }),
    });

    const blast = result.risks.find((risk) => risk.issueName === "Blast");
    expect(blast?.severity).toBe("high");
    expect(blast?.prevention.estimatedCostBdt).toBe(640);
    expect(blast?.matchedConditions.join(" ")).toContain("humidity");
  });

  it("flags potato late blight under cool wet weather", () => {
    const result = assessPestDiseaseRisk({
      cropId: "potato",
      growthStage: "vegetative",
      daysAfterSowing: 45,
      areaAcres: 1.5,
      weather: weather({ rain: [4, 5, 3, 1, 2, 0, 1], min: 12, max: 20, humidity: 88 }),
    });

    const lateBlight = result.risks[0];
    expect(lateBlight?.issueName).toBe("Late blight");
    expect(lateBlight?.severity).toBe("high");
    expect(lateBlight?.treatment.estimatedCostBdt).toBe(2250);
  });

  it("keeps dry low-humidity conditions below high severity", () => {
    const result = assessPestDiseaseRisk({
      cropId: "tomato",
      growthStage: "flowering",
      daysAfterSowing: 55,
      areaAcres: 1,
      weather: weather({ rain: [0, 0, 0, 0, 0, 0, 0], min: 20, max: 28, humidity: 55 }),
    });

    expect(result.highestSeverity).not.toBe("high");
  });
});
