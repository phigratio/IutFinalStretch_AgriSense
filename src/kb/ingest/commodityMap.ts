/**
 * WFP commodity label + unit → canonical crop IDs and price unit (navid/kb §4.2).
 * WFP labels are messy ("Rice (coarse, BR-8/ 11/, Guti Sharna)") and units vary ("KG", "100 KG").
 * A generic rice grade maps to BOTH rice crops (aman + boro share the coarse-rice sale price);
 * variety-specific labels refine to one season.
 */

import type { CropId } from "../../data/crops.js";
import type { PriceUnit } from "../../engines/financials.js";

export interface CommodityMapping {
  cropIds: CropId[];
  /** Data-quality caveat surfaced in provenance (e.g. mustard OIL used as a seed-price proxy). */
  note?: string;
}

/** Map a raw WFP commodity label to canonical crop IDs, or null if out of scope. */
export function mapCommodity(label: string): CommodityMapping | null {
  const l = label.toLowerCase();

  if (l.includes("rice")) {
    // Explicit boro varieties.
    if (/brri?-?\s*2[89]|bri-?\s*2[89]/.test(l)) return { cropIds: ["rice_boro"] };
    // Explicit aman variety.
    if (/brri?-?\s*49|bri-?\s*49/.test(l)) return { cropIds: ["rice_t_aman"] };
    // Generic grade (coarse / medium / local names) applies to both rice crops.
    return { cropIds: ["rice_t_aman", "rice_boro"] };
  }
  if (l.includes("wheat")) {
    if (l.includes("flour")) return null; // processed, not farm-gate
    return { cropIds: ["wheat"] };
  }
  if (l.includes("maize") || l.includes("corn")) return { cropIds: ["maize"] };
  if (l.includes("potato")) return { cropIds: ["potato"] };
  if (l.includes("lentil") || l.includes("masur")) return { cropIds: ["lentil"] };
  if (l.includes("onion")) return { cropIds: ["onion"] };
  if (l.includes("mustard")) {
    return {
      cropIds: ["mustard"],
      note: "WFP lists mustard OIL, not seed — used as a proxy for the mustard price; verify before relying on it.",
    };
  }
  return null;
}

/** Map a WFP unit string to a normalizable price unit, or null if not per-weight (pcs, L…). */
export function mapUnit(wfpUnit: string): PriceUnit | null {
  const u = wfpUnit.trim().toLowerCase().replace(/\s+/g, " ");
  if (u === "kg" || u === "1 kg") return "kg";
  if (u === "100 kg" || u === "quintal") return "quintal";
  if (u === "mt" || u === "1 mt" || u === "ton" || u === "tonne") return "ton";
  if (u.includes("maund")) return "maund";
  return null; // "10 pcs", "L", bundles — not convertible to BDT/kg
}
