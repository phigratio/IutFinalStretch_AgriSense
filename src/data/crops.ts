import aliasesJson from "./crop_aliases.json" with { type: "json" };

/**
 * Canonical crop IDs. Aman and Boro rice are separate crops — they differ in
 * dose, calendar, and variety, so "rice" is deliberately never a valid ID
 * (spec §7.1). Keep this list in sync with the CSV `cropId` columns.
 */
export const CROP_IDS = [
  "rice_t_aman",
  "rice_boro",
  "wheat",
  "maize",
  "potato",
  "tomato",
  "mustard",
  "lentil",
  "onion",
] as const;

export type CropId = (typeof CROP_IDS)[number];

const ALIASES = aliasesJson as Record<CropId, string[]>;

/** Bare terms that identify rice but not which rice — must be disambiguated by season. */
const AMBIGUOUS_TERMS = ["rice", "paddy", "ধান", "চাল", "ধান্য"];

export function isCropId(value: string): value is CropId {
  return (CROP_IDS as readonly string[]).includes(value);
}

// alias (lowercased) -> cropId, longest aliases first so specific beats generic.
const ALIAS_INDEX: { alias: string; cropId: CropId }[] = Object.entries(ALIASES)
  .flatMap(([cropId, aliases]) =>
    aliases.map((alias) => ({ alias: alias.toLowerCase().trim(), cropId: cropId as CropId })),
  )
  .sort((a, b) => b.alias.length - a.alias.length);

export interface CropResolution {
  cropId: CropId | null;
  /** true when the text names rice/paddy generically without an Aman/Boro qualifier. */
  ambiguous: boolean;
}

/**
 * Resolve free text (English or Bangla) to a canonical crop ID. Returns
 * `{cropId: null, ambiguous: true}` when the text says "rice"/"ধান" without
 * specifying Aman vs Boro — the caller should ask which season/type.
 */
export function resolveCrop(text: string): CropResolution {
  const lower = text.toLowerCase().trim();
  if (!lower) return { cropId: null, ambiguous: false };

  // Direct canonical ID passthrough.
  if (isCropId(lower)) return { cropId: lower, ambiguous: false };

  // Longest alias contained in the text wins (handles "I'll grow boro rice").
  for (const { alias, cropId } of ALIAS_INDEX) {
    if (lower === alias || lower.includes(alias)) {
      return { cropId, ambiguous: false };
    }
  }

  if (AMBIGUOUS_TERMS.some((t) => lower.includes(t))) {
    return { cropId: null, ambiguous: true };
  }

  return { cropId: null, ambiguous: false };
}

/** Convenience: the crop ID or null (ambiguity collapses to null). */
export function resolveCropId(text: string): CropId | null {
  return resolveCrop(text).cropId;
}
