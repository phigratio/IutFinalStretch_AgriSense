/**
 * Soil profile tool (T0-2 / §1.3). Texture and fertility are SEPARATE. Fertility keys FRG doses;
 * when the farmer has no soil test and gives no override, fall back to the SRDI district default
 * and mark the assumption so the agent can state it and offer an override.
 */

import { getSrdiFertility, type FertilityClass } from "../data/loader.js";

export type FertilitySource = "user_soil_test" | "user_override" | "srdi_default";

export interface SoilProfileResult {
  fertilityClass: FertilityClass;
  fertilitySource: FertilitySource;
  district: string;
  assumption?: string;
  sourceUrl: string;
}

export interface SoilProfileInput {
  district: string;
  /** From a lab soil test, if the farmer has one. */
  soilTestFertility?: FertilityClass;
  /** Farmer's own low/medium/high assessment. */
  overrideFertility?: FertilityClass;
}

/**
 * Resolve fertility class with clear provenance. Returns null when the district is unknown and no
 * farmer-provided value exists — the caller must then ask (never invent a default).
 */
export function getSoilProfile(input: SoilProfileInput): SoilProfileResult | null {
  const { district, soilTestFertility, overrideFertility } = input;

  if (soilTestFertility) {
    return {
      fertilityClass: soilTestFertility,
      fertilitySource: "user_soil_test",
      district,
      sourceUrl: "farmer soil test",
    };
  }
  if (overrideFertility) {
    return {
      fertilityClass: overrideFertility,
      fertilitySource: "user_override",
      district,
      sourceUrl: "farmer override",
    };
  }
  const srdi = getSrdiFertility(district);
  if (srdi) {
    return {
      fertilityClass: srdi,
      fertilitySource: "srdi_default",
      district,
      assumption: `No soil test provided — using SRDI default fertility '${srdi}' for ${district}. You can override this.`,
      sourceUrl: "http://srdi.gov.bd",
    };
  }
  return null;
}
