/**
 * Pure decision + knowledge-grounding helpers for leaf diagnosis (Tier-2 T2-4):
 *  - decideUseHf: accept the HuggingFace classifier or fall back to OpenAI vision,
 *    based on confidence and whether the predicted crop matches the farm's crop.
 *  - matchKbTreatment: cross-reference a detected disease against the pest/disease
 *    KB (pest_disease_rules.csv) to attach grounded prevention/treatment + ৳cost +
 *    a [KB:…] citation, so the advice is explainable rather than model-only.
 * No I/O beyond the CSV loader; unit-tested. Consumed by leafDiagnosisService.ts.
 */
import { loadPestRules } from "../pest/pestRiskEngine.js";
import { type CropId } from "../data/crops.js";
import { type SupportedLanguage } from "../language/localization.js";
import { type ParsedLeafLabel } from "./labelMap.js";

export interface LeafDecision {
  useHf: boolean;
  reason: string;
}

export function decideUseHf(input: {
  top?: { label: string; score: number };
  parsed?: ParsedLeafLabel;
  farmerCropId?: CropId;
  threshold: number;
}): LeafDecision {
  const { top, parsed, farmerCropId, threshold } = input;
  if (!top || !parsed) return { useHf: false, reason: "no HuggingFace prediction available" };
  if (top.score < threshold) {
    return { useHf: false, reason: `HF confidence ${top.score.toFixed(2)} below threshold ${threshold}` };
  }
  // The classifier doesn't cover this farm's crop (e.g. it has no rice class), so a
  // high score here is a misclassification — defer to the grounded vision fallback.
  if (farmerCropId && parsed.cropId !== farmerCropId) {
    return {
      useHf: false,
      reason: `HF crop ${parsed.cropId ?? "unrecognized"} conflicts with the farm's crop ${farmerCropId}`,
    };
  }
  return { useHf: true, reason: `HF confident (${top.score.toFixed(2)}) and crop-compatible` };
}

export interface KbTreatmentMatch {
  matched: boolean;
  issueName?: string;
  symptoms?: string;
  prevention: { text: string; estimatedCostBdt?: number };
  treatment: { text: string; estimatedCostBdt?: number };
  citation?: string;
}

const GENERIC_SAFETY_NOTE =
  "Follow local DAE/SAAO advice and product label dosage before pesticide or fungicide use.";
const STOPWORDS = new Set(["and", "the", "leaf", "disease", "of", "on", "in"]);

/** Cross-reference a detected disease to the pest/disease KB for the crop. */
export function matchKbTreatment(input: {
  diseaseName: string;
  cropId?: CropId;
  areaAcres: number;
}): KbTreatmentMatch {
  const unmatched: KbTreatmentMatch = {
    matched: false,
    prevention: { text: GENERIC_SAFETY_NOTE },
    treatment: { text: GENERIC_SAFETY_NOTE },
  };
  if (!input.cropId || /healthy/i.test(input.diseaseName)) return unmatched;

  const wanted = tokenize(input.diseaseName);
  if (!wanted.length) return unmatched;

  const rules = loadPestRules().filter((rule) => rule.cropId === input.cropId);
  let best: { rule: (typeof rules)[number]; overlap: number } | undefined;
  for (const rule of rules) {
    const overlap = countOverlap(wanted, tokenize(rule.issueName));
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { rule, overlap };
  }
  if (!best) return unmatched;

  const area = input.areaAcres > 0 ? input.areaAcres : 1;
  const rule = best.rule;
  return {
    matched: true,
    issueName: rule.issueName,
    symptoms: rule.symptoms,
    prevention: {
      text: `${rule.prevention} ${GENERIC_SAFETY_NOTE}`,
      estimatedCostBdt: Math.round(rule.preventionCostBdtPerAcre * area),
    },
    treatment: {
      text: `${rule.treatment} ${GENERIC_SAFETY_NOTE}`,
      estimatedCostBdt: Math.round(rule.treatmentCostBdtPerAcre * area),
    },
    citation: `[KB:${rule.source.source_name}${rule.source.page ? ` ${rule.source.page}` : ""}]`,
  };
}

/** Localized caution shown whenever a diagnosis leans on the general vision model. */
export function buildCaution(
  source: "openai" | "unavailable",
  language: SupportedLanguage,
  isLeaf = true,
): string {
  if (source === "unavailable") {
    if (language === "bn")
      return "এই মুহূর্তে ছবি থেকে রোগ শনাক্ত করা যাচ্ছে না। অনুগ্রহ করে পরে চেষ্টা করুন এবং স্থানীয় কৃষি কর্মকর্তার (DAE/SAAO) পরামর্শ নিন।";
    if (language === "banglish")
      return "Ekhon image theke rog shonakto kora jacche na. Pore try korun ebong local DAE/SAAO officer er poramorsho nin.";
    return "Image-based diagnosis is unavailable right now. Please try again later and consult your local DAE/SAAO officer.";
  }
  const notLeaf = !isLeaf;
  if (language === "bn")
    return notLeaf
      ? "⚠️ ছবিটি স্পষ্ট পাতার মতো মনে হয়নি। এটি একটি AI অনুমান — স্থানীয় কৃষি কর্মকর্তার (DAE/SAAO) পরামর্শ ছাড়া কীটনাশক প্রয়োগ করবেন না।"
      : "⚠️ প্রশিক্ষিত মডেল নিশ্চিত ছিল না, তাই এটি একটি AI অনুমান — ল্যাব পরীক্ষা নয়। ওষুধ কেনার আগে স্থানীয় DAE/SAAO কর্মকর্তার সঙ্গে যাচাই করুন।";
  if (language === "banglish")
    return notLeaf
      ? "⚠️ Chobita spshto pata mone hoyni. Eta ekta AI onuman — local DAE/SAAO officer er poramorsho chara pesticide apply korben na."
      : "⚠️ Trained model shure chilo na, tai eta ekta AI onuman — lab test noy. Ordering medicine er age local DAE/SAAO officer er sathe verify korun.";
  return notLeaf
    ? "⚠️ This may not be a clear leaf photo. This is an AI visual estimate — do not apply pesticides without confirming with your local DAE/SAAO officer."
    : "⚠️ The trained model was not confident, so this is an AI visual estimate, not a lab diagnosis. Confirm with your local DAE/SAAO officer before spending on pesticides.";
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

function countOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((word) => setB.has(word)).length;
}
