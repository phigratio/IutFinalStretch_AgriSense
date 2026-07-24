import { describe, it, expect } from "vitest";
import { getSoilProfile } from "./soil.js";

describe("getSoilProfile (texture/fertility split §1.3)", () => {
  it("uses a soil test first (highest confidence)", () => {
    const r = getSoilProfile({ district: "Kushtia", soilTestFertility: "high" });
    expect(r).toMatchObject({ fertilityClass: "high", fertilitySource: "user_soil_test" });
  });

  it("uses a farmer override next", () => {
    const r = getSoilProfile({ district: "Kushtia", overrideFertility: "low" });
    expect(r).toMatchObject({ fertilityClass: "low", fertilitySource: "user_override" });
  });

  it("falls back to the SRDI district default with a stated assumption", () => {
    const r = getSoilProfile({ district: "Kushtia" });
    expect(r?.fertilitySource).toBe("srdi_default");
    expect(r?.assumption).toMatch(/override/i);
  });

  it("returns null for an unknown district (never invents a default)", () => {
    expect(getSoilProfile({ district: "Atlantis" })).toBeNull();
  });
});
