import { describe, it, expect } from "vitest";
import { generateSeasonPlan } from "./seasonPlan.js";

const base = {
  cropId: "rice_t_aman" as const,
  areaHa: 1,
  fertilityClass: "medium" as const,
  waterAvailability: "limited_irrigation" as const,
  systemDate: new Date("2026-07-01T00:00:00"),
};

describe("generateSeasonPlan", () => {
  it("covers land prep -> harvest with the required stages", () => {
    const plan = generateSeasonPlan(base);
    const stages = new Set(plan.tasks.map((t) => t.stage));
    for (const s of [
      "land_preparation",
      "transplanting",
      "basal_fertilizer",
      "urea_topdress",
      "irrigation",
      "weeding",
      "pest_scouting",
      "harvest",
    ]) {
      expect(stages.has(s), `missing stage ${s}`).toBe(true);
    }
  });

  it("urea top-dress splits come from the FRG row (3 splits for aman)", () => {
    const plan = generateSeasonPlan(base);
    const splits = plan.tasks.filter((t) => t.stage === "urea_topdress");
    expect(splits).toHaveLength(3);
  });

  it("date policy: no farmer date -> anchor is the window midpoint, stated as editable", () => {
    const plan = generateSeasonPlan(base);
    expect(plan.anchorAssumption).toMatch(/midpoint/i);
    expect(plan.anchorAssumption).toMatch(/change it/i);
    // anchor within the window
    expect(plan.anchorDate >= plan.windowStart).toBe(true);
    expect(plan.anchorDate <= plan.windowEnd).toBe(true);
  });

  it("date policy: farmer-given anchor is used verbatim", () => {
    const plan = generateSeasonPlan({ ...base, anchorDate: new Date("2026-08-05T00:00:00") });
    expect(plan.anchorDate).toBe("2026-08-05");
    expect(plan.anchorAssumption).not.toMatch(/midpoint/i);
  });

  it("fertilizer quantities scale with area", () => {
    const one = generateSeasonPlan({ ...base, areaHa: 1 });
    const two = generateSeasonPlan({ ...base, areaHa: 2 });
    const basalUrea = (p: typeof one) =>
      p.tasks
        .find((t) => t.stage === "basal_fertilizer")!
        .inputs.find((i) => i.item.startsWith("Urea"))!.qtyForArea;
    expect(basalUrea(two)).toBeCloseTo(basalUrea(one) * 2, 2);
  });

  it("rainfed farms get no irrigation checkpoints", () => {
    const plan = generateSeasonPlan({ ...base, waterAvailability: "rainfed" });
    expect(plan.tasks.some((t) => t.stage === "irrigation")).toBe(false);
  });

  it("weather-note hook flags heavy rain near a fertilizer task", () => {
    const anchorDate = new Date("2026-08-05T00:00:00");
    const plan = generateSeasonPlan({
      ...base,
      anchorDate,
      forecast: {
        daily: [
          { date: "2026-08-05", rainMm: 45 }, // heavy rain on basal day
          { date: "2026-08-06", rainMm: 5 },
        ],
      },
    });
    const basal = plan.tasks.find((t) => t.stage === "basal_fertilizer")!;
    expect(basal.weatherNote).toBeTruthy();
    expect(basal.weatherNote).toMatch(/delay/i);
  });
});
