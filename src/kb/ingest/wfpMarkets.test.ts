import { describe, expect, it } from "vitest";
import { fetchWfpMarkets, parseWfpMarkets } from "./wfpMarkets.js";

describe("WFP markets loader", () => {
  it("maps market_id to district and coordinates", () => {
    const markets = parseWfpMarkets("market_id,market,admin2,latitude,longitude\n42,Kushtia Sadar,Kushtia,23.9,89.1\n");
    expect(markets.get("42")).toMatchObject({ district: "Kushtia", latitude: 23.9, longitude: 89.1 });
  });

  it("resolves and downloads the markets resource with injectable fetch", async () => {
    const fetchFn = async (url: string) => url.includes("package_show")
      ? { ok: true, status: 200, json: async () => ({ result: { resources: [{ name: "wfp_markets_bgd.csv", url: "https://fixture/markets.csv" }] } }), text: async () => "" }
      : { ok: true, status: 200, json: async () => ({}), text: async () => "market_id,admin2\n1,Dhaka\n" };
    expect((await fetchWfpMarkets(fetchFn)).get("1")?.district).toBe("Dhaka");
  });
});
