/**
 * Conversational normalizers (intake). Turns farmer-spoken quantities into canonical engine
 * units. Price→BDT/kg lives with the finance code, not here (task.md B1).
 */

import type { SoilTexture } from "../data/loader.js";

// ---- Area -------------------------------------------------------------------

export type AreaUnit = "acre" | "decimal" | "bigha" | "kani" | "ha" | "hectare";

/** Conversion to hectares. Bigha uses the standard 33-decimal bigha (confirm with farmer). */
export const AREA_TO_HA: Record<Exclude<AreaUnit, "kani">, number> = {
  acre: 0.404686,
  decimal: 0.00404686, // 1 decimal = 1/100 acre
  bigha: 0.1338, // standard 33-decimal bigha
  ha: 1,
  hectare: 1,
};

export interface AreaResult {
  areaHa: number | null;
  /** Set when we assumed something the farmer should confirm (e.g. bigha size). */
  needsConfirmation?: string;
  /** Set when the unit is too ambiguous to convert (e.g. regional kani). */
  needsClarification?: string;
  original: { value: number; unit: AreaUnit };
}

export function normalizeArea(value: number, unit: AreaUnit): AreaResult {
  const original = { value, unit };
  if (unit === "kani") {
    return {
      areaHa: null,
      needsClarification:
        "Kani varies by region. How many decimals (শতক) is that, or how many bigha?",
      original,
    };
  }
  const areaHa = round(value * AREA_TO_HA[unit], 4);
  const result: AreaResult = { areaHa, original };
  if (unit === "bigha") {
    result.needsConfirmation =
      "I used the standard 33-decimal bigha. Is your bigha that size?";
  }
  return result;
}

const BANGLA_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

export function bengaliToLatinDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => BANGLA_DIGITS[d] ?? d);
}

const UNIT_WORDS: { pattern: RegExp; unit: AreaUnit }[] = [
  { pattern: /(hectare|hectares|\bha\b|হেক্টর)/i, unit: "hectare" },
  { pattern: /(acre|acres|একর)/i, unit: "acre" },
  { pattern: /(decimal|decimals|শতক|শতাংশ)/i, unit: "decimal" },
  { pattern: /(bigha|বিঘা)/i, unit: "bigha" },
  { pattern: /(kani|কানি)/i, unit: "kani" },
];

/** Parse free text like "২ বিঘা" or "1.5 acres" into value+unit, then normalize. */
export function normalizeAreaText(text: string): AreaResult | null {
  const latin = bengaliToLatinDigits(text);
  const num = latin.match(/-?\d+(\.\d+)?/);
  const unitMatch = UNIT_WORDS.find((u) => u.pattern.test(latin));
  if (!num || !unitMatch) return null;
  return normalizeArea(Number(num[0]), unitMatch.unit);
}

// ---- Soil texture -----------------------------------------------------------

const SOIL_WORDS: { pattern: RegExp; texture: SoilTexture }[] = [
  { pattern: /(sandy|sand|বেলে|বালি)/i, texture: "sandy" },
  { pattern: /(loam|loamy|দোআঁশ|দো-আঁশ|doash)/i, texture: "loam" },
  { pattern: /(clay|clayey|এঁটেল|এটেল|etel)/i, texture: "clay" },
  { pattern: /(silt|silty|পলি)/i, texture: "silt" },
];

export function normalizeSoilTexture(text: string): SoilTexture {
  const found = SOIL_WORDS.find((s) => s.pattern.test(text));
  return found ? found.texture : "unknown";
}

// ---- Season -----------------------------------------------------------------

export type Season = "kharif1" | "kharif2_aman" | "rabi" | "boro";

/** Establishment (sow/transplant) month windows used to decide what's plantable "now". */
const SEASON_PLANTING_MONTHS: Record<Season, number[]> = {
  kharif1: [3, 4, 5], // Aus, pre-monsoon
  kharif2_aman: [6, 7, 8], // Aman transplant
  rabi: [10, 11, 12], // winter crops
  boro: [12, 1, 2], // Boro transplant
};

/** Seasons whose planting window includes the given date's month (system-date driven). */
export function deriveSeasonCandidates(date: Date = new Date()): Season[] {
  const month = date.getMonth() + 1;
  const now = (Object.keys(SEASON_PLANTING_MONTHS) as Season[]).filter((s) =>
    SEASON_PLANTING_MONTHS[s].includes(month),
  );
  if (now.length) return now;
  // Nothing plantable this month → nearest upcoming season.
  return [nearestUpcomingSeason(month)];
}

function nearestUpcomingSeason(month: number): Season {
  let best: Season = "rabi";
  let bestGap = 99;
  for (const s of Object.keys(SEASON_PLANTING_MONTHS) as Season[]) {
    for (const m of SEASON_PLANTING_MONTHS[s]) {
      const gap = (m - month + 12) % 12;
      if (gap < bestGap) {
        bestGap = gap;
        best = s;
      }
    }
  }
  return best;
}

const SEASON_ALIASES: { pattern: RegExp; season: Season }[] = [
  { pattern: /(aman|রোপা আমন|আমন)/i, season: "kharif2_aman" },
  { pattern: /(boro|বোরো)/i, season: "boro" },
  { pattern: /(aus|kharif.?1|আউশ)/i, season: "kharif1" },
  { pattern: /(rabi|winter|রবি|শীত)/i, season: "rabi" },
];

/** Map a spoken season name to the canonical id. Returns null if unrecognized. */
export function normalizeSeasonAlias(text: string): Season | null {
  return SEASON_ALIASES.find((s) => s.pattern.test(text))?.season ?? null;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
