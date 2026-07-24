/**
 * WFP / HDX price ingester (navid/kb §4.2) — the only real live price API path.
 * HDX has NO row-query API for this dataset (datastore_active=false): we resolve the CSV resource
 * via CKAN package_show, download the bulk CSV (302 → signed S3, redirect followed), and parse.
 * Each price row already carries admin2 (district) + lat/lon, so no separate markets join is
 * needed. Pure parse is separated from the fetch layer so tests run offline against a fixture.
 */

import { parseCsv } from "../../data/loader.js";
import { mapCommodity, mapUnit } from "./commodityMap.js";
import type { CropId } from "../../data/crops.js";
import type { PriceUnit } from "../../engines/financials.js";

const CKAN_PACKAGE =
  "https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-bangladesh";

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
}

export interface WfpDeps {
  fetchFn?: FetchLike;
}

/** One hub price observation, ready to upsert as PriceObservation(tenantId="hub"). */
export interface IngestedPrice {
  tenantId: "hub";
  cropId: CropId;
  commodityLabel: string;
  district?: string;
  market?: string;
  latitude?: number;
  longitude?: number;
  price: number;
  unit: PriceUnit;
  priceType: "retail" | "wholesale";
  currency: "BDT";
  observedAt: string; // YYYY-MM-DD
  source: "WFP/HDX";
  sourceUrl: string;
  dataOrigin: "real";
  verification: "cross_checked";
  note?: string;
}

export interface ParseOptions {
  sourceUrl?: string;
  /** Keep only the most recent observation per (cropId, market, priceType). Default true. */
  keepLatestOnly?: boolean;
  /** Drop observations before this ISO date (e.g. "2023-01-01"). */
  sinceDate?: string;
}

const DEFAULT_SOURCE_URL =
  "https://data.humdata.org/dataset/wfp-food-prices-for-bangladesh";

/** Pure: parse the WFP food-prices CSV text into hub price observations for our crops. */
export function parseWfpPrices(csvText: string, opts: ParseOptions = {}): IngestedPrice[] {
  const rows = parseCsv(csvText);
  const sourceUrl = opts.sourceUrl ?? DEFAULT_SOURCE_URL;
  const out: IngestedPrice[] = [];

  for (const row of rows) {
    if ((row.priceflag ?? "").toLowerCase() !== "actual") continue; // skip aggregates/imputed
    const mapping = mapCommodity(row.commodity ?? "");
    if (!mapping) continue;
    const unit = mapUnit(row.unit ?? "");
    if (!unit) continue;
    const price = Number(row.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const observedAt = (row.date ?? "").trim();
    if (!observedAt) continue;
    if (opts.sinceDate && observedAt < opts.sinceDate) continue;

    const priceType = (row.pricetype ?? "").toLowerCase() === "wholesale" ? "wholesale" : "retail";
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);

    for (const cropId of mapping.cropIds) {
      out.push({
        tenantId: "hub",
        cropId,
        commodityLabel: row.commodity ?? "",
        district: row.admin2 || undefined,
        market: row.market || undefined,
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lon) ? lon : undefined,
        price,
        unit,
        priceType,
        currency: "BDT",
        observedAt,
        source: "WFP/HDX",
        sourceUrl,
        dataOrigin: "real",
        verification: "cross_checked",
        note: mapping.note,
      });
    }
  }

  return opts.keepLatestOnly === false ? out : keepLatest(out);
}

function keepLatest(prices: IngestedPrice[]): IngestedPrice[] {
  const best = new Map<string, IngestedPrice>();
  for (const p of prices) {
    const key = `${p.cropId}|${p.market ?? ""}|${p.priceType}`;
    const cur = best.get(key);
    if (!cur || p.observedAt > cur.observedAt) best.set(key, p);
  }
  return [...best.values()];
}

const defaultFetch: FetchLike = (url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>;

/** Resolve the CSV resource via CKAN, download it (follows the 302), and return its text. */
export async function fetchWfpPriceCsv(deps: WfpDeps = {}): Promise<{ csv: string; sourceUrl: string }> {
  const fetchFn = deps.fetchFn ?? defaultFetch;
  const headers = { "user-agent": "AgriSense-KB/1.0 (+hackathon)" };

  const pkgResp = await fetchFn(CKAN_PACKAGE, { headers });
  if (!pkgResp.ok) throw new Error(`HDX package_show failed: HTTP ${pkgResp.status}`);
  const pkg = (await pkgResp.json()) as {
    result?: { resources?: { url?: string; name?: string; format?: string }[] };
  };
  const resources = pkg.result?.resources ?? [];
  const resource =
    resources.find((r) => /food_prices_bgd\.csv/i.test(r.url ?? "")) ??
    resources.find((r) => (r.format ?? "").toUpperCase() === "CSV" && /food prices/i.test(r.name ?? ""));
  if (!resource?.url) throw new Error("WFP food-prices CSV resource not found in HDX package");

  const csvResp = await fetchFn(resource.url, { headers });
  if (!csvResp.ok) throw new Error(`WFP CSV download failed: HTTP ${csvResp.status}`);
  return { csv: await csvResp.text(), sourceUrl: resource.url };
}

/** Fetch + parse in one call. */
export async function ingestWfpPrices(deps: WfpDeps = {}, opts: ParseOptions = {}): Promise<IngestedPrice[]> {
  const { csv, sourceUrl } = await fetchWfpPriceCsv(deps);
  return parseWfpPrices(csv, { ...opts, sourceUrl });
}
