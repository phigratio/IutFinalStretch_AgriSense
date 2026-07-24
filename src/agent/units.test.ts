import { describe, it, expect } from "vitest";
import {
  normalizeArea,
  normalizeAreaText,
  normalizeSoilTexture,
  deriveSeasonCandidates,
  normalizeSeasonAlias,
} from "./normalize.js";

describe("area normalization (G1)", () => {
  it("2 acres -> 0.8094 ha", () => {
    expect(normalizeArea(2, "acre").areaHa).toBe(0.8094);
  });

  it("100 decimals -> 1 acre (0.4047 ha)", () => {
    expect(normalizeArea(100, "decimal").areaHa).toBe(0.4047);
  });

  it("hectare passes through", () => {
    expect(normalizeArea(3, "ha").areaHa).toBe(3);
  });

  it("bigha converts but flags a confirmation", () => {
    const r = normalizeArea(2, "bigha");
    expect(r.areaHa).toBeCloseTo(0.2676, 4);
    expect(r.needsConfirmation).toBeTruthy();
  });

  it("kani cannot be converted blindly -> asks for decimals", () => {
    const r = normalizeArea(1, "kani");
    expect(r.areaHa).toBeNull();
    expect(r.needsClarification).toBeTruthy();
  });

  it("parses Bangla text '২ বিঘা'", () => {
    const r = normalizeAreaText("আমার ২ বিঘা জমি");
    expect(r?.original.unit).toBe("bigha");
    expect(r?.original.value).toBe(2);
  });

  it("parses '1.5 acres'", () => {
    const r = normalizeAreaText("1.5 acres");
    expect(r?.areaHa).toBeCloseTo(0.607, 3);
  });
});

describe("soil texture normalization", () => {
  it("maps English and Bangla words", () => {
    expect(normalizeSoilTexture("sandy soil")).toBe("sandy");
    expect(normalizeSoilTexture("দোআঁশ মাটি")).toBe("loam");
    expect(normalizeSoilTexture("এঁটেল")).toBe("clay");
    expect(normalizeSoilTexture("পলি")).toBe("silt");
  });

  it("returns unknown when unrecognized", () => {
    expect(normalizeSoilTexture("good soil")).toBe("unknown");
  });
});

describe("season handling (system-date driven, not hard-coded)", () => {
  it("July -> Aman is a candidate", () => {
    const july = new Date("2026-07-24T00:00:00");
    expect(deriveSeasonCandidates(july)).toContain("kharif2_aman");
  });

  it("November -> rabi is a candidate", () => {
    const nov = new Date("2026-11-10T00:00:00");
    expect(deriveSeasonCandidates(nov)).toContain("rabi");
  });

  it("always returns at least one season", () => {
    for (let m = 0; m < 12; m++) {
      const d = new Date(2026, m, 15);
      expect(deriveSeasonCandidates(d).length).toBeGreaterThan(0);
    }
  });

  it("maps season aliases incl. Bangla", () => {
    expect(normalizeSeasonAlias("রোপা আমন")).toBe("kharif2_aman");
    expect(normalizeSeasonAlias("Boro")).toBe("boro");
    expect(normalizeSeasonAlias("rabi season")).toBe("rabi");
    expect(normalizeSeasonAlias("nonsense")).toBeNull();
  });
});
