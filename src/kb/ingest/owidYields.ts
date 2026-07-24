/**
 * Real Bangladesh crop yields from Our World in Data (FAOSTAT-derived), as an open CSV per crop
 * (tonnes/ha, no auth). Used to replace placeholder variety yields with real national values.
 * Grapher CSV: https://ourworldindata.org/grapher/<slug>.csv (columns Entity,Code,Year,<yield>).
 * FAOSTAT's own REST API is gated (401); OWID mirrors the same data as a plain CSV download.
 */

import type { CropId } from "../../data/crops.js";

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
  }>;
}

/** cropId → OWID grapher slug. Aman + Boro both use the national rice yield baseline. */
export const CROP_OWID_SLUG: Partial<Record<CropId, string>> = {
  rice_t_aman: "rice-yields",
  rice_boro: "rice-yields",
  wheat: "wheat-yields",
  maize: "maize-yields",
  potato: "potato-yields",
  mustard: "rapeseed-yields", // rapeseed/colza — the mustard family
};

const OWID_BASE = "https://ourworldindata.org/grapher";
const defaultFetch: FetchLike = (u, i) => fetch(u, i) as unknown as ReturnType<FetchLike>;

export interface YieldRow {
  cropId: CropId;
  yieldTPerHa: number;
  year: number;
  source: string;
  sourceUrl: string;
}

/** Parse an OWID grapher CSV → the most recent value for a country (default Bangladesh). */
export function parseOwidYieldForCountry(csv: string, code = "BGD"): { year: number; value: number } | null {
  const lines = csv.split(/\r?\n/);
  let best: { year: number; value: number } | null = null;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols[1] !== code) continue;
    const year = Number(cols[2]);
    const value = Number(cols[3]);
    if (!Number.isFinite(year) || !Number.isFinite(value)) continue;
    if (!best || year > best.year) best = { year, value };
  }
  return best;
}

export async function fetchOwidYield(slug: string, deps: { fetchFn?: FetchLike } = {}): Promise<{ year: number; value: number } | null> {
  const fetchFn = deps.fetchFn ?? defaultFetch;
  const res = await fetchFn(`${OWID_BASE}/${slug}.csv`, { headers: { "user-agent": "AgriSense-KB/1.0" } });
  if (!res.ok) throw new Error(`OWID ${slug} failed: HTTP ${res.status}`);
  return parseOwidYieldForCountry(await res.text());
}

/** Fetch real latest yields for every covered crop. */
export async function ingestOwidYields(deps: { fetchFn?: FetchLike } = {}): Promise<YieldRow[]> {
  const out: YieldRow[] = [];
  for (const [cropId, slug] of Object.entries(CROP_OWID_SLUG) as [CropId, string][]) {
    try {
      const r = await fetchOwidYield(slug, deps);
      if (r && r.value > 0) {
        out.push({
          cropId,
          yieldTPerHa: Math.round(r.value * 100) / 100,
          year: r.year,
          source: `OWID/FAOSTAT (${slug})`,
          sourceUrl: `${OWID_BASE}/${slug}`,
        });
      }
    } catch {
      // Skip a crop OWID doesn't cover; caller keeps the existing baseline.
    }
  }
  return out;
}
