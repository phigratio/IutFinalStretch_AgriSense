import { describe, it, expect } from "vitest";
import { mapCommodity, mapUnit } from "./commodityMap.js";

describe("mapCommodity (real WFP labels)", () => {
  it("maps generic rice grades to both rice crops", () => {
    expect(mapCommodity("Rice (coarse, BR-8/ 11/, Guti Sharna)")?.cropIds).toEqual([
      "rice_t_aman",
      "rice_boro",
    ]);
    expect(mapCommodity("Rice (medium grain)")?.cropIds).toEqual(["rice_t_aman", "rice_boro"]);
  });

  it("refines explicit varieties to a season", () => {
    expect(mapCommodity("Rice (BRRI-49)")?.cropIds).toEqual(["rice_t_aman"]);
    expect(mapCommodity("Rice (BRRI-28)")?.cropIds).toEqual(["rice_boro"]);
    expect(mapCommodity("Rice (BRRI-29)")?.cropIds).toEqual(["rice_boro"]);
  });

  it("maps the other crops and rejects processed/out-of-scope", () => {
    expect(mapCommodity("Wheat")?.cropIds).toEqual(["wheat"]);
    expect(mapCommodity("Wheat flour")).toBeNull(); // processed
    expect(mapCommodity("Potatoes (Holland)")?.cropIds).toEqual(["potato"]);
    expect(mapCommodity("Lentils (masur)")?.cropIds).toEqual(["lentil"]);
    expect(mapCommodity("Onions (imported)")?.cropIds).toEqual(["onion"]);
    expect(mapCommodity("Fuel (petrol)")).toBeNull();
  });

  it("flags the mustard-oil proxy caveat", () => {
    const m = mapCommodity("Oil (mustard)");
    expect(m?.cropIds).toEqual(["mustard"]);
    expect(m?.note).toMatch(/proxy/i);
  });
});

describe("mapUnit", () => {
  it("maps weight units and rejects non-weight", () => {
    expect(mapUnit("KG")).toBe("kg");
    expect(mapUnit("100 KG")).toBe("quintal");
    expect(mapUnit("MT")).toBe("ton");
    expect(mapUnit("10 pcs")).toBeNull();
    expect(mapUnit("L")).toBeNull();
  });
});
