import { describe, it, expect } from "vitest";
import { rankCrops, RANK_WEIGHTS, type RankProfile } from "./ranking.js";

const baseProfile = (over: Partial<RankProfile> = {}): RankProfile => ({
  areaHa: 0.81,
  soilTexture: "loam",
  fertilityClass: "medium",
  waterAvailability: "reliable_irrigation",
  budgetBdt: 120000,
  targetSeason: "boro",
  ...over,
});

const normals = { seasonRainMm: 300, seasonTmeanC: 22 };
const weather = { totalRainNext7Mm: 20, tmeanNext7C: 24 };

describe("rankCrops", () => {
  it("weights sum to 1", () => {
    const sum = Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  it("returns every candidate with subscores, reasons and sources", () => {
    const ranked = rankCrops(baseProfile(), weather, normals);
    expect(ranked.length).toBe(8);
    for (const r of ranked) {
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.sources.length).toBeGreaterThan(0);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("season-fitting crops sort ahead of off-season ones", () => {
    const ranked = rankCrops(baseProfile({ targetSeason: "boro" }), weather, normals);
    // boro rice fits; it should out-rank an off-season crop like potato (rabi)
    const boroIdx = ranked.findIndex((r) => r.cropId === "rice_boro");
    const potatoIdx = ranked.findIndex((r) => r.cropId === "potato");
    expect(boroIdx).toBeLessThan(potatoIdx);
    expect(ranked[0].fitsTargetSeason).toBe(true);
  });

  it("G6: lowering water availability lowers waterFit for a high-water crop (boro rice)", () => {
    const reliable = rankCrops(baseProfile({ waterAvailability: "reliable_irrigation" }), weather, normals);
    const rainfed = rankCrops(baseProfile({ waterAvailability: "rainfed" }), weather, normals);

    const boroReliable = reliable.find((r) => r.cropId === "rice_boro")!;
    const boroRainfed = rainfed.find((r) => r.cropId === "rice_boro")!;

    expect(boroRainfed.subscores.waterFit).toBeLessThan(boroReliable.subscores.waterFit);
  });

  it("marks whether each crop fits the target season", () => {
    const ranked = rankCrops(baseProfile({ targetSeason: "rabi" }), weather, normals);
    const wheat = ranked.find((r) => r.cropId === "wheat")!; // wheat is rabi
    const aman = ranked.find((r) => r.cropId === "rice_t_aman")!; // aman is kharif2
    expect(wheat.fitsTargetSeason).toBe(true);
    expect(aman.fitsTargetSeason).toBe(false);
  });
});
