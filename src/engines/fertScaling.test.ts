import { describe, it, expect } from "vitest";
import { scaleDose } from "./financials.js";
import { getFertilizer } from "../data/loader.js";

describe("fertilizer dose scaling is linear in area (G2)", () => {
  it("scaleDose: kg/ha * ha", () => {
    expect(scaleDose(180, 1)).toBe(180);
    expect(scaleDose(180, 2)).toBe(360);
    expect(scaleDose(180, 0.5)).toBe(90);
  });

  it("real FRG row scales linearly for 1 / 2 / 0.5 ha", () => {
    const dose = getFertilizer("rice_boro", "medium");
    expect(dose).toBeDefined();
    const urea = dose!.urea;
    expect(scaleDose(urea, 2)).toBeCloseTo(scaleDose(urea, 1) * 2, 6);
    expect(scaleDose(urea, 0.5)).toBeCloseTo(scaleDose(urea, 1) * 0.5, 6);
    // half a hectare is exactly half the full-hectare dose
    expect(scaleDose(urea, 0.5) * 2).toBeCloseTo(scaleDose(urea, 1), 6);
  });
});
