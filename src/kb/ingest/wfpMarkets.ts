import { parseCsv } from "../../data/loader.js";
import type { FetchLike } from "./wfpPrices.js";

const CKAN_PACKAGE = "https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-bangladesh";

export interface WfpMarket {
  marketId: string;
  district?: string;
  market?: string;
  latitude?: number;
  longitude?: number;
}

export function parseWfpMarkets(csv: string): Map<string, WfpMarket> {
  const markets = new Map<string, WfpMarket>();
  for (const row of parseCsv(csv)) {
    const marketId = String(row.market_id ?? row.marketid ?? "").trim();
    if (!marketId) continue;
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    markets.set(marketId, {
      marketId,
      district: row.admin2 || row.district || undefined,
      market: row.market || undefined,
      latitude: Number.isFinite(latitude) ? latitude : undefined,
      longitude: Number.isFinite(longitude) ? longitude : undefined,
    });
  }
  return markets;
}

export async function fetchWfpMarkets(fetchFn: FetchLike = (url, init) => fetch(url, init) as never): Promise<Map<string, WfpMarket>> {
  const headers = { "user-agent": "AgriSense-KB/1.0 (+hackathon)" };
  const pkgResponse = await fetchFn(CKAN_PACKAGE, { headers });
  if (!pkgResponse.ok) throw new Error(`HDX package_show failed: HTTP ${pkgResponse.status}`);
  const pkg = await pkgResponse.json() as { result?: { resources?: { url?: string; name?: string }[] } };
  const resource = (pkg.result?.resources ?? []).find((r) => /markets_bgd\.csv/i.test(`${r.name ?? ""} ${r.url ?? ""}`));
  if (!resource?.url) throw new Error("WFP markets CSV resource not found in HDX package");
  const response = await fetchFn(resource.url, { headers });
  if (!response.ok) throw new Error(`WFP markets CSV download failed: HTTP ${response.status}`);
  return parseWfpMarkets(await response.text());
}
