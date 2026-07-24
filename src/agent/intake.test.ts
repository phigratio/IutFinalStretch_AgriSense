import { describe, it, expect } from "vitest";
import {
  requiredFieldGaps,
  isComplete,
  applyExtracted,
  nextQuestion,
  normalizeWater,
  type IntakeState,
} from "./intake.js";

describe("intake gap logic", () => {
  it("lists only unfilled required fields", () => {
    const state: IntakeState = { district: "Kushtia", areaHa: 0.8 };
    const gaps = requiredFieldGaps(state);
    expect(gaps).not.toContain("district");
    expect(gaps).not.toContain("areaHa");
    expect(gaps).toContain("soilTexture");
    expect(isComplete(state)).toBe(false);
  });

  it("is complete when all six required fields are present", () => {
    const state: IntakeState = {
      district: "Kushtia",
      areaHa: 0.8,
      soilTexture: "loam",
      waterAvailability: "limited_irrigation",
      budgetBdt: 80000,
      targetSeason: "kharif2_aman",
    };
    expect(isComplete(state)).toBe(true);
  });
});

describe("applyExtracted normalization + fertility (§1.3)", () => {
  it("normalizes area and soil, sets district", () => {
    const { state } = applyExtracted(
      {},
      { district: "Kushtia", areaValue: 2, areaUnit: "acre", soilText: "দোআঁশ মাটি" },
    );
    expect(state.district).toBe("Kushtia");
    expect(state.areaHa).toBe(0.8094);
    expect(state.soilTexture).toBe("loam");
  });

  it("resolves SRDI default fertility with source + assumption note", () => {
    const { state, notes } = applyExtracted({}, { district: "Kushtia" });
    expect(state.fertilityClass).toBe("medium");
    expect(state.fertilitySource).toBe("srdi_default");
    expect(notes.join(" ")).toMatch(/SRDI default/i);
  });

  it("prefers a soil test over the SRDI default", () => {
    const { state } = applyExtracted({}, { district: "Kushtia", soilTestFertility: "high" });
    expect(state.fertilityClass).toBe("high");
    expect(state.fertilitySource).toBe("user_soil_test");
  });

  it("G4: unknown district -> no fertility invented, asks the farmer", () => {
    const { state, notes } = applyExtracted({}, { district: "Atlantis" });
    expect(state.fertilityClass).toBeUndefined();
    expect(notes.join(" ")).toMatch(/soil test|low\/medium\/high/i);
  });

  it("never blanks a known field on a later empty extraction", () => {
    const first = applyExtracted({}, { district: "Kushtia", budgetBdt: 80000 }).state;
    const second = applyExtracted(first, { soilText: "loam" }).state;
    expect(second.district).toBe("Kushtia");
    expect(second.budgetBdt).toBe(80000);
  });
});

describe("water + question phrasing", () => {
  it("maps water availability words", () => {
    expect(normalizeWater("only rain")).toBe("rainfed");
    expect(normalizeWater("I have a deep tube well")).toBe("reliable_irrigation");
    expect(normalizeWater("some irrigation sometimes")).toBe("limited_irrigation");
  });

  it("asks only for missing fields, at most three", () => {
    const q = nextQuestion({ district: "Kushtia", areaHa: 0.8 });
    expect(q).toBeTruthy();
    expect(q).not.toMatch(/district/i);
    const full = nextQuestion({
      district: "K",
      areaHa: 1,
      soilTexture: "loam",
      waterAvailability: "rainfed",
      budgetBdt: 1,
      targetSeason: "boro",
    });
    expect(full).toBeNull();
  });
});
