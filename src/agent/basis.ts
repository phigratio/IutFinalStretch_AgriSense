/**
 * Recommendation-basis builder (F2 / A5). Built IN CODE from the profile + trace numbers and
 * injected into the reply — the LLM writes narrative around this block but never the block
 * itself, so the stated inputs always match what actually drove the numbers.
 */

import type { IntakeState } from "./intake.js";
import type { ForecastResult, NormalsResult } from "../tools/weather.js";
import type { FinancialResult } from "../engines/financials.js";

export interface BasisInput {
  profile: IntakeState;
  chosenCropDisplay: string;
  fertilityAssumption?: string;
  forecast: ForecastResult | null;
  normals: NormalsResult | null;
  seasonRainMm: number | null;
  financials: FinancialResult;
  priceBdtPerKg: number;
  priceSource: string;
  priceDate: string;
}

export function buildRecommendationBasis(input: BasisInput): string {
  const { profile, forecast, normals, seasonRainMm, financials } = input;
  const lines: string[] = ["Recommendation basis:"];

  const areaAcres = profile.areaValue && profile.areaUnit === "acre" ? `${profile.areaValue} acres` : null;
  const farmBits = [
    areaAcres,
    profile.areaHa != null ? `${profile.areaHa} ha` : null,
    profile.soilTexture,
    profile.district,
    profile.waterAvailability?.replace(/_/g, " "),
    profile.budgetBdt != null ? `BDT ${profile.budgetBdt.toLocaleString()}` : null,
    profile.targetSeason,
  ].filter(Boolean);
  lines.push(`- Crop: ${input.chosenCropDisplay}.`);
  lines.push(`- Farm: ${farmBits.join(", ")}.`);

  if (profile.fertilityClass) {
    lines.push(
      `- Soil: fertility '${profile.fertilityClass}' (${profile.fertilitySource ?? "unknown source"})` +
        (input.fertilityAssumption ? ` — ${input.fertilityAssumption}` : "") +
        ".",
    );
  }

  if (forecast) {
    const label = forecast.stale ? "cached forecast" : "forecast (next 7 days)";
    lines.push(
      `- Weather: Open-Meteo ${label} retrieved ${forecast.retrievedAt}: ` +
        `${forecast.totalRainNext7Mm} mm rain, mean ${forecast.tmeanNext7C}°C.`,
    );
  } else {
    lines.push(`- Weather: live forecast unavailable — proceeding on historical normals only.`);
  }
  if (normals && seasonRainMm != null) {
    lines.push(
      `- Season normals (${normals.yearsUsed} archive): ~${Math.round(seasonRainMm)} mm rainfall over the ${profile.targetSeason} months.`,
    );
  }

  lines.push(
    `- Agronomy: FRG-2018 doses, BRRI/BARI variety yield, BARC calendar window.`,
  );
  lines.push(
    `- Price: ${input.priceSource} (${input.priceDate}), ${input.priceBdtPerKg} BDT/kg.`,
  );
  lines.push(
    `- Economics: cost BDT ${Math.round(financials.totalCostBdt).toLocaleString()}, ` +
      `revenue BDT ${Math.round(financials.grossRevenueBdt).toLocaleString()}, ` +
      `net BDT ${Math.round(financials.netProfitBdt).toLocaleString()} (ROI ${financials.roiPercent.toFixed(0)}%).`,
  );

  return lines.join("\n");
}
