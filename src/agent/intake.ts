/**
 * Conversational intake (T0-1, A3). Deterministic gap logic + normalization. The LLM only
 * extracts raw fields (see Extractor); everything gated/normalized here is code so the agent
 * asks ONLY for missing fields and never re-asks a known one.
 */

import {
  normalizeArea,
  normalizeSoilTexture,
  normalizeSeasonAlias,
  type AreaUnit,
  type Season,
} from "./normalize.js";
import { getSoilProfile, type FertilitySource } from "../tools/soil.js";
import type { SoilTexture, FertilityClass } from "../data/loader.js";

export type WaterAvailability = "rainfed" | "limited_irrigation" | "reliable_irrigation";

export interface IntakeState {
  locationText?: string;
  district?: string;
  upazila?: string;
  lat?: number;
  lon?: number;
  areaValue?: number;
  areaUnit?: AreaUnit;
  areaHa?: number;
  soilTexture?: SoilTexture;
  fertilityClass?: FertilityClass;
  fertilitySource?: FertilitySource;
  waterAvailability?: WaterAvailability;
  budgetBdt?: number;
  targetSeason?: Season;
  currentCrop?: string;
}

/** Raw fields the LLM extractor may fill from a farmer message (English or Bangla). */
export interface ExtractedFields {
  locationText?: string;
  district?: string;
  upazila?: string;
  areaValue?: number;
  areaUnit?: AreaUnit;
  soilText?: string;
  soilTestFertility?: FertilityClass;
  overrideFertility?: FertilityClass;
  waterText?: string;
  budgetBdt?: number;
  seasonText?: string;
  currentCrop?: string;
}

export interface Extractor {
  extract(message: string, current: IntakeState): Promise<ExtractedFields>;
}

export const REQUIRED = [
  "district",
  "areaHa",
  "soilTexture",
  "waterAvailability",
  "budgetBdt",
  "targetSeason",
] as const;

export type RequiredField = (typeof REQUIRED)[number];

export function requiredFieldGaps(state: IntakeState): RequiredField[] {
  return REQUIRED.filter((f) => state[f] === undefined || state[f] === null);
}

export function isComplete(state: IntakeState): boolean {
  return requiredFieldGaps(state).length === 0;
}

const WATER_WORDS: { pattern: RegExp; value: WaterAvailability }[] = [
  { pattern: /(reliable|deep tube|pump|always|assured|full irrigation|সেচ নিশ্চিত)/i, value: "reliable_irrigation" },
  { pattern: /(limited|sometimes|partial|occasion|shallow|কিছুটা সেচ)/i, value: "limited_irrigation" },
  { pattern: /(rain[- ]?fed|rainfed|no irrigation|only rain|বৃষ্টিনির্ভর)/i, value: "rainfed" },
];

export function normalizeWater(text: string): WaterAvailability | undefined {
  return WATER_WORDS.find((w) => w.pattern.test(text))?.value;
}

export interface MergeResult {
  state: IntakeState;
  /** Assumptions/confirmations to surface to the farmer (e.g. bigha size, SRDI default). */
  notes: string[];
}

/**
 * Merge a raw extraction into intake state, normalizing units and resolving fertility. Only fills
 * fields that are currently empty is NOT enforced here — the extractor is told known fields — but
 * we never blank an existing value with undefined.
 */
export function applyExtracted(state: IntakeState, ex: ExtractedFields): MergeResult {
  const next: IntakeState = { ...state };
  const notes: string[] = [];

  if (ex.locationText) next.locationText ??= ex.locationText;
  if (ex.district) next.district = ex.district;
  if (ex.upazila) next.upazila = ex.upazila;
  if (ex.currentCrop) next.currentCrop = ex.currentCrop;
  if (ex.budgetBdt != null) next.budgetBdt = ex.budgetBdt;

  if (ex.areaValue != null && ex.areaUnit) {
    const area = normalizeArea(ex.areaValue, ex.areaUnit);
    next.areaValue = ex.areaValue;
    next.areaUnit = ex.areaUnit;
    if (area.areaHa != null) next.areaHa = area.areaHa;
    if (area.needsConfirmation) notes.push(area.needsConfirmation);
    if (area.needsClarification) notes.push(area.needsClarification);
  }

  if (ex.soilText) {
    const texture = normalizeSoilTexture(ex.soilText);
    if (texture !== "unknown" || next.soilTexture === undefined) next.soilTexture = texture;
  }

  if (ex.waterText) {
    const w = normalizeWater(ex.waterText);
    if (w) next.waterAvailability = w;
  }

  if (ex.seasonText) {
    const s = normalizeSeasonAlias(ex.seasonText);
    if (s) next.targetSeason = s;
  }

  // Resolve fertility (separate from texture, §1.3) once we know the district.
  if (next.district && (ex.soilTestFertility || ex.overrideFertility || next.fertilityClass == null)) {
    const soil = getSoilProfile({
      district: next.district,
      soilTestFertility: ex.soilTestFertility,
      overrideFertility: ex.overrideFertility,
    });
    if (soil) {
      next.fertilityClass = soil.fertilityClass;
      next.fertilitySource = soil.fertilitySource;
      if (soil.assumption) notes.push(soil.assumption);
    } else {
      notes.push(
        `I don't have an SRDI fertility default for "${next.district}". Do you have a soil test, or is your land low/medium/high fertility?`,
      );
    }
  }

  return { state: next, notes };
}

/** A single farmer-friendly follow-up covering up to 3 missing fields (never re-asking). */
export function nextQuestion(state: IntakeState): string | null {
  const gaps = requiredFieldGaps(state).slice(0, 3);
  if (gaps.length === 0) return null;
  const ask: Record<RequiredField, string> = {
    district: "which district your farm is in",
    areaHa: "how much land you have (bigha, acre, or decimals)",
    soilTexture: "your soil type (sandy, loam/দোআঁশ, clay, or silt)",
    waterAvailability: "your water source (rainfed, some irrigation, or reliable irrigation)",
    budgetBdt: "your budget in taka",
    targetSeason: "which season you're planning for (Aman, Boro, Rabi, or Aus)",
  };
  const parts = gaps.map((g) => ask[g]);
  return `Could you tell me ${joinList(parts)}?`;
}

function joinList(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}
