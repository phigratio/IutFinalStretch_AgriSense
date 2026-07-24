/**
 * Parse HuggingFace PlantVillage-style labels ("Tomato___Late_blight") into a
 * normalized {crop, condition, healthy} shape and map the crop to an AgriSense
 * CropId where one exists (tomato / potato / maize). Pure + unit-tested; consumed
 * by src/vision/leafDiagnosisService.ts to decide HF-accept vs OpenAI fallback and
 * to look up grounded treatment from the pest/disease KB.
 */
import { type CropId } from "../data/crops.js";

export interface ParsedLeafLabel {
  raw: string;
  crop: string; // normalized crop words, e.g. "tomato", "maize"
  cropDisplay: string; // "Tomato"
  condition: string; // normalized, e.g. "late blight" or "healthy"
  diseaseName: string; // display form, e.g. "Late Blight" or "Healthy"
  healthy: boolean;
  cropId?: CropId; // mapped AgriSense crop when known
}

const HIGH_SEVERITY_KEYWORDS = [
  "blight",
  "blast",
  "rot",
  "mildew",
  "virus",
  "curl",
  "mold",
  "wilt",
  "greening",
  "measles",
  "huanglongbing",
];
const MEDIUM_SEVERITY_KEYWORDS = ["spot", "rust", "scab", "scorch", "mite", "mosaic", "esca"];

/** Best-effort map from a HuggingFace crop word to one of our canonical CropIds. */
export function mapHfCropToCropId(cropText: string): CropId | undefined {
  const c = cropText.toLowerCase();
  if (c.includes("tomato")) return "tomato";
  if (c.includes("potato")) return "potato";
  if (c.includes("corn") || c.includes("maize")) return "maize";
  return undefined;
}

/** Rough severity from the condition words alone (HF gives no severity of its own). */
export function diseaseSeverityHint(condition: string): "none" | "low" | "medium" | "high" {
  const c = condition.toLowerCase();
  if (!c || c === "healthy") return "none";
  if (HIGH_SEVERITY_KEYWORDS.some((k) => c.includes(k))) return "high";
  if (MEDIUM_SEVERITY_KEYWORDS.some((k) => c.includes(k))) return "medium";
  return "medium";
}

export function parseLeafLabel(rawLabel: string): ParsedLeafLabel {
  const raw = (rawLabel ?? "").trim();
  let cropPart = "";
  let conditionPart = raw;

  if (raw.includes("___")) {
    const [left, ...rest] = raw.split("___");
    cropPart = left ?? "";
    conditionPart = rest.join(" ");
  } else {
    // No delimiter — try to peel a known crop word off the front.
    const detected = detectKnownCropWord(raw);
    if (detected) {
      cropPart = detected;
      conditionPart = raw.slice(detected.length);
    }
  }

  const crop = normalizeWords(cropPart);
  // Some model variants phrase labels as "Tomato with Late Blight" — drop the "with".
  const condition = normalizeWords(conditionPart).replace(/^with\s+/, "");
  const healthy = condition === "healthy" || condition === "";
  const cropId = mapHfCropToCropId(crop);

  return {
    raw,
    crop,
    cropDisplay: titleCase(crop) || "Unknown",
    condition: healthy ? "healthy" : condition,
    diseaseName: healthy ? "Healthy" : titleCase(condition) || "Unknown",
    healthy,
    cropId,
  };
}

function detectKnownCropWord(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const word of ["tomato", "potato", "corn", "maize", "apple", "grape", "pepper", "peach", "strawberry", "cherry", "orange", "rice"]) {
    if (lower.startsWith(word)) return text.slice(0, word.length);
  }
  return undefined;
}

/** Lowercase words, drop "(maize)" parentheticals, commas, and underscores. */
function normalizeWords(value: string): string {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
