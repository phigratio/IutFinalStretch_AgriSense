import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import soilFitJson from "./soil_fit_matrix.json" with { type: "json" };
import type { CropId } from "./crops.js";

/** Standard provenance columns present on every table row (spec §7.2). */
export interface SourceColumns {
  source_name: string;
  source_url: string;
  source_doc: string;
  page: string;
  retrieved_date: string;
  data_origin: "real" | "manual" | "mock";
  verification_status: "verified" | "cross_checked" | "unverified";
}

export type Row = Record<string, string>;

/** Minimal RFC-4180-ish CSV parser: handles double-quoted fields and quoted commas. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      field = "";
      if (record.some((f) => f.length > 0)) rows.push(record);
      record = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (record.some((f) => f.length > 0)) rows.push(record);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cols) => {
    const row: Row = {};
    header.forEach((h, idx) => {
      row[h] = (cols[idx] ?? "").trim();
    });
    return row;
  });
}

export interface LoadOptions {
  /** Allow `data_origin=mock` rows. Default false — Tier 0 must never read mock (spec §7.3). */
  allowMock?: boolean;
}

const cache = new Map<string, Row[]>();

/** Load a CSV from src/data by basename, filtering out mock rows unless explicitly allowed. */
export function loadTable(basename: string, opts: LoadOptions = {}): Row[] {
  let rows = cache.get(basename);
  if (!rows) {
    const path = fileURLToPath(new URL(`./${basename}`, import.meta.url));
    rows = parseCsv(readFileSync(path, "utf8"));
    cache.set(basename, rows);
  }
  return opts.allowMock ? rows : rows.filter((r) => r.data_origin !== "mock");
}

// ---- Typed accessors --------------------------------------------------------

export type FertilityClass = "low" | "medium" | "high";
export type SoilTexture = "sandy" | "loam" | "clay" | "silt" | "unknown";

export interface CalendarRow {
  cropId: CropId;
  season: string;
  windowStartMonth: number;
  windowStartDay: number;
  windowEndMonth: number;
  windowEndDay: number;
  durationDays: number;
  anchorStage: string;
}

export interface FertilizerRow {
  cropId: CropId;
  fertilityClass: FertilityClass;
  urea: number;
  tsp: number;
  mop: number;
  gypsum: number;
  zinc: number;
  ureaBasalFraction: number;
  ureaSplitDays: number[];
}

export interface VarietyRow {
  varietyId: string;
  cropId: CropId;
  name: string;
  yieldTPerHa: number;
  durationDays: number;
}

export interface PriceRow {
  cropId: CropId;
  market: string;
  price: number;
  unit: string;
  priceType: string;
  date: string;
  source: SourceColumns;
}

const num = (v: string | undefined, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function getCalendar(cropId: string, season?: string): CalendarRow | undefined {
  const rows = loadTable("crop_calendar.csv").filter(
    (r) => r.cropId === cropId && (season ? r.season === season : true),
  );
  const r = rows[0];
  if (!r) return undefined;
  return {
    cropId: r.cropId as CropId,
    season: r.season,
    windowStartMonth: num(r.windowStartMonth),
    windowStartDay: num(r.windowStartDay),
    windowEndMonth: num(r.windowEndMonth),
    windowEndDay: num(r.windowEndDay),
    durationDays: num(r.durationDays),
    anchorStage: r.anchorStage,
  };
}

export function getWaterNeedMm(cropId: string): number | undefined {
  const r = loadTable("crop_water.csv").find((x) => x.cropId === cropId);
  return r ? num(r.totalWaterMm) : undefined;
}

export function getWaterCriticalStages(cropId: string): string[] {
  const r = loadTable("crop_water.csv").find((x) => x.cropId === cropId);
  return r ? r.criticalStages.split("|").filter(Boolean) : [];
}

/** Fertilizer dose for (crop, fertility). Falls back to `medium`, then any row for the crop. */
export function getFertilizer(cropId: string, fertility: FertilityClass): FertilizerRow | undefined {
  const forCrop = loadTable("fertilizer_frg.csv").filter((r) => r.cropId === cropId);
  const r =
    forCrop.find((x) => x.fertilityClass === fertility) ??
    forCrop.find((x) => x.fertilityClass === "medium") ??
    forCrop[0];
  if (!r) return undefined;
  return {
    cropId: r.cropId as CropId,
    fertilityClass: r.fertilityClass as FertilityClass,
    urea: num(r.urea_kg_ha),
    tsp: num(r.tsp_kg_ha),
    mop: num(r.mop_kg_ha),
    gypsum: num(r.gypsum_kg_ha),
    zinc: num(r.zinc_kg_ha),
    ureaBasalFraction: num(r.ureaBasalFraction, 0.33),
    ureaSplitDays: (r.ureaSplitDaysAfterEstablish || "")
      .split(";")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n)),
  };
}

export function getVariety(varietyId: string): VarietyRow | undefined {
  const r = loadTable("varieties.csv").find((x) => x.varietyId === varietyId);
  return r ? toVariety(r) : undefined;
}

export function getVarietyForCrop(cropId: string): VarietyRow | undefined {
  const crop = loadTable("crops.csv").find((x) => x.cropId === cropId);
  if (crop?.defaultVarietyId) {
    const v = getVariety(crop.defaultVarietyId);
    if (v) return v;
  }
  const r = loadTable("varieties.csv").find((x) => x.cropId === cropId);
  return r ? toVariety(r) : undefined;
}

function toVariety(r: Row): VarietyRow {
  return {
    varietyId: r.varietyId,
    cropId: r.cropId as CropId,
    name: r.name,
    yieldTPerHa: num(r.yield_t_ha),
    durationDays: num(r.durationDays),
  };
}

/** Cheapest-to-most-recent is out of scope; returns the first real price row for the crop. */
export function getPrice(cropId: string, opts: LoadOptions = {}): PriceRow | undefined {
  const r = loadTable("prices_dam.csv", opts).find((x) => x.cropId === cropId);
  if (!r) return undefined;
  return {
    cropId: r.cropId as CropId,
    market: r.market,
    price: num(r.price),
    unit: r.unit,
    priceType: r.priceType,
    date: r.date,
    source: toSource(r),
  };
}

export function getSrdiFertility(district: string): FertilityClass | undefined {
  const r = loadTable("srdi_fertility.csv").find(
    (x) => x.district.toLowerCase() === district.toLowerCase(),
  );
  return r ? (r.defaultFertilityClass as FertilityClass) : undefined;
}

const soilFit = soilFitJson as Record<string, Record<string, number>>;

export function getSoilFit(cropId: string, texture: SoilTexture): number {
  return soilFit[cropId]?.[texture] ?? soilFit[cropId]?.unknown ?? 0.5;
}

export function toSource(r: Row): SourceColumns {
  return {
    source_name: r.source_name,
    source_url: r.source_url,
    source_doc: r.source_doc,
    page: r.page,
    retrieved_date: r.retrieved_date,
    data_origin: r.data_origin as SourceColumns["data_origin"],
    verification_status: r.verification_status as SourceColumns["verification_status"],
  };
}

/** Clear the in-memory CSV cache (tests). */
export function _resetCache(): void {
  cache.clear();
}
