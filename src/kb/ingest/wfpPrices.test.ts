import { describe, it, expect } from "vitest";
import { parseWfpPrices, fetchWfpPriceCsv, type FetchLike } from "./wfpPrices.js";

// Real-shaped WFP header + rows: quoted-comma label, "100 KG" unit, a pcs row to skip,
// an aggregate row to skip, and two months of the same series for latest-only.
const HEADER =
  "date,admin1,admin2,market,market_id,latitude,longitude,category,commodity,commodity_id,unit,priceflag,pricetype,currency,price,usdprice";
const CSV = [
  HEADER,
  `2026-04-15,Khulna,Kushtia,Kushtia Sadar,3001,23.90,89.12,cereals and tubers,"Rice (coarse, BR-8/ 11/, Guti Sharna)",588,100 KG,actual,Retail,BDT,5200,47.9`,
  `2026-05-15,Khulna,Kushtia,Kushtia Sadar,3001,23.90,89.12,cereals and tubers,"Rice (coarse, BR-8/ 11/, Guti Sharna)",588,100 KG,actual,Retail,BDT,5400,49.5`,
  `2026-05-15,Dhaka,Dhaka,Dhaka,2574,23.81,90.41,pulses and nuts,Lentils (masur),620,KG,actual,Retail,BDT,110,1.01`,
  `2026-05-15,Dhaka,Dhaka,Dhaka,2574,23.81,90.41,vegetables and fruits,Onions (local),700,10 pcs,actual,Retail,BDT,45,0.41`,
  `2026-05-15,Dhaka,Dhaka,Dhaka,2574,23.81,90.41,cereals and tubers,Rice (BRRI-29),590,KG,aggregate,Wholesale,BDT,52,0.48`,
].join("\n");

describe("parseWfpPrices", () => {
  const prices = parseWfpPrices(CSV, { sourceUrl: "http://x/csv" });

  it("expands generic rice to both rice crops and keeps only the latest per series", () => {
    const aman = prices.filter((p) => p.cropId === "rice_t_aman");
    const boro = prices.filter((p) => p.cropId === "rice_boro");
    expect(aman).toHaveLength(1);
    expect(boro).toHaveLength(1);
    // latest month (May) kept, not April
    expect(aman[0].observedAt).toBe("2026-05-15");
    expect(aman[0].price).toBe(5400);
  });

  it("carries district, market, lat/lon, unit and provenance", () => {
    const rice = prices.find((p) => p.cropId === "rice_t_aman")!;
    expect(rice.district).toBe("Kushtia");
    expect(rice.market).toBe("Kushtia Sadar");
    expect(rice.latitude).toBeCloseTo(23.9, 2);
    expect(rice.unit).toBe("quintal"); // 100 KG
    expect(rice.priceType).toBe("retail");
    expect(rice.source).toBe("WFP/HDX");
    expect(rice.dataOrigin).toBe("real");
    expect(rice.tenantId).toBe("hub");
  });

  it("maps lentil, skips non-weight units (pcs) and aggregate rows", () => {
    expect(prices.some((p) => p.cropId === "lentil")).toBe(true);
    expect(prices.some((p) => p.cropId === "onion")).toBe(false); // 10 pcs -> skipped
    // BRRI-29 row is aggregate -> skipped, so no boro from that row
    expect(prices.filter((p) => p.cropId === "rice_boro").every((p) => p.observedAt === "2026-05-15")).toBe(true);
  });

  it("keepLatestOnly=false retains history (both months)", () => {
    const all = parseWfpPrices(CSV, { keepLatestOnly: false });
    const amanMonths = all.filter((p) => p.cropId === "rice_t_aman").map((p) => p.observedAt).sort();
    expect(amanMonths).toEqual(["2026-04-15", "2026-05-15"]);
  });
});

describe("fetchWfpPriceCsv (CKAN → CSV, injected fetch)", () => {
  it("resolves the CSV resource from package_show then downloads it", async () => {
    const calls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      calls.push(url);
      if (url.includes("package_show")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: {
              resources: [
                { url: "http://hdx/markets/wfp_markets_bgd.csv", name: "Markets", format: "CSV" },
                { url: "http://hdx/download/wfp_food_prices_bgd.csv", name: "Food Prices", format: "CSV" },
              ],
            },
          }),
          text: async () => "",
        };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => CSV };
    };

    const { csv, sourceUrl } = await fetchWfpPriceCsv({ fetchFn });
    expect(sourceUrl).toMatch(/food_prices_bgd\.csv/);
    expect(csv).toContain("Rice (coarse");
    expect(calls[0]).toContain("package_show");
  });
});
