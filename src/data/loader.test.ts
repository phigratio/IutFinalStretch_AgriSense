import { describe, it, expect } from "vitest";
import {
  parseCsv,
  loadTable,
  getCalendar,
  getFertilizer,
  getVarietyForCrop,
  getPrice,
  getSrdiFertility,
  getSoilFit,
  getWaterNeedMm,
} from "./loader.js";
import { CROP_IDS } from "./crops.js";

describe("csv parser", () => {
  it("parses header + rows and handles quoted commas", () => {
    const rows = parseCsv('a,b,c\n1,"x,y",3\n4,5,6\n');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ a: "1", b: "x,y", c: "3" });
    expect(rows[1]).toEqual({ a: "4", b: "5", c: "6" });
  });
});

describe("mock isolation (spec §7.3)", () => {
  it("excludes data_origin=mock rows by default", () => {
    const prices = loadTable("prices_dam.csv");
    expect(prices.every((r) => r.data_origin !== "mock")).toBe(true);
  });

  it("includes mock rows only when explicitly allowed", () => {
    const withMock = loadTable("prices_dam.csv", { allowMock: true });
    expect(withMock.some((r) => r.data_origin === "mock")).toBe(true);
  });

  it("getPrice never returns a mock row on the Tier 0 path", () => {
    // the mock row is priced 999 for rice_boro; the real one is not 999
    const p = getPrice("rice_boro");
    expect(p?.price).not.toBe(999);
    expect(p?.source.data_origin).toBe("real");
  });
});

describe("typed accessors cover all 8 crops", () => {
  it("calendar, water, fertilizer, variety, price exist for every crop", () => {
    for (const cropId of CROP_IDS) {
      expect(getCalendar(cropId), `calendar ${cropId}`).toBeDefined();
      expect(getWaterNeedMm(cropId), `water ${cropId}`).toBeGreaterThan(0);
      expect(getFertilizer(cropId, "medium"), `fert ${cropId}`).toBeDefined();
      expect(getVarietyForCrop(cropId)?.yieldTPerHa, `yield ${cropId}`).toBeGreaterThan(0);
      expect(getPrice(cropId)?.price, `price ${cropId}`).toBeGreaterThan(0);
    }
  });

  it("fertilizer falls back to medium when the class is missing", () => {
    // wheat only has a medium row; asking for high should fall back, not throw
    const high = getFertilizer("wheat", "high");
    expect(high?.fertilityClass).toBe("medium");
    expect(high?.urea).toBeGreaterThan(0);
  });

  it("parses urea split days into numbers", () => {
    const f = getFertilizer("rice_t_aman", "medium");
    expect(f?.ureaSplitDays).toEqual([15, 35, 55]);
  });

  it("srdi fertility lookup is case-insensitive", () => {
    expect(getSrdiFertility("Kushtia")).toBe("medium");
    expect(getSrdiFertility("kushtia")).toBe("medium");
    expect(getSrdiFertility("Dinajpur")).toBe("high");
    expect(getSrdiFertility("Nowhere-district")).toBeUndefined();
  });

  it("soil fit reflects agronomy (rice prefers clay over sandy)", () => {
    expect(getSoilFit("rice_boro", "clay")).toBeGreaterThan(getSoilFit("rice_boro", "sandy"));
    expect(getSoilFit("potato", "loam")).toBeGreaterThan(getSoilFit("potato", "clay"));
  });
});
