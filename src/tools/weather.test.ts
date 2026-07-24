import { describe, it, expect, beforeEach } from "vitest";
import {
  parseGeocode,
  parseForecast,
  parseNormals,
  getForecast,
  geocodeLocation,
  WeatherUnavailableError,
  _clearWeatherCache,
  type FetchFn,
} from "./weather.js";

const okFetch = (payload: unknown): FetchFn => async () => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

const failFetch = (): { fn: FetchFn; calls: () => number } => {
  let calls = 0;
  const fn: FetchFn = async () => {
    calls++;
    throw new Error("network down");
  };
  return { fn, calls: () => calls };
};

beforeEach(() => _clearWeatherCache());

describe("pure parsers", () => {
  it("parseGeocode picks the top match", () => {
    const g = parseGeocode(
      { results: [{ latitude: 23.9, longitude: 89.1, name: "Kushtia", admin1: "Khulna" }] },
      "url",
      "ts",
    );
    expect(g).toMatchObject({ lat: 23.9, lon: 89.1, matchedName: "Kushtia", admin1: "Khulna" });
  });

  it("parseGeocode returns null when no match", () => {
    expect(parseGeocode({ results: [] }, "url", "ts")).toBeNull();
  });

  it("parseForecast computes 7/16-day totals and mean temp", () => {
    const daily = {
      time: Array.from({ length: 16 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`),
      precipitation_sum: Array.from({ length: 16 }, () => 10), // 10mm/day
      temperature_2m_max: Array.from({ length: 16 }, () => 32),
      temperature_2m_min: Array.from({ length: 16 }, () => 24),
    };
    const f = parseForecast({ daily }, "url", "ts");
    expect(f.totalRainNext7Mm).toBe(70);
    expect(f.totalRainNext16Mm).toBe(160);
    expect(f.tmeanNext7C).toBe(28); // (32+24)/2
    expect(f.daily).toHaveLength(16);
    expect(f.stale).toBe(false);
  });

  it("parseNormals averages archive rain by month across years", () => {
    // Aug: 2024 has two 10mm days (total 20), 2025 has two 20mm days (total 40) -> avg 30
    const daily = {
      time: ["2024-08-01", "2024-08-02", "2025-08-01", "2025-08-02"],
      precipitation_sum: [10, 10, 20, 20],
      temperature_2m_max: [33, 33, 31, 31],
      temperature_2m_min: [26, 26, 24, 24],
    };
    const n = parseNormals({ daily }, [8], "2016–2025", "url", "ts");
    expect(n.monthly[0]).toMatchObject({ month: 8, avgRainMm: 30 });
    expect(n.monthly[0].avgTmaxC).toBe(32); // mean of 33,33,31,31
    expect(n.stale).toBe(true); // normals are always labelled historical, never forecast
  });
});

describe("fetch layer: retry, cache, never invent", () => {
  const goodDaily = {
    daily: {
      time: ["2026-08-01", "2026-08-02"],
      precipitation_sum: [5, 5],
      temperature_2m_max: [32, 32],
      temperature_2m_min: [24, 24],
    },
  };

  it("geocodeLocation throws when there is no match (no fabrication)", async () => {
    await expect(geocodeLocation("nowhere", { fetchFn: okFetch({ results: [] }) })).rejects.toThrow(
      WeatherUnavailableError,
    );
  });

  it("retries exactly once on failure, then throws when no cache", async () => {
    const { fn, calls } = failFetch();
    await expect(getForecast(23.9, 89.1, { fetchFn: fn })).rejects.toThrow(WeatherUnavailableError);
    expect(calls()).toBe(2); // initial + one retry
  });

  it("serves stale-but-real cache when a later call fails", async () => {
    // 1) succeed and populate cache
    const first = await getForecast(23.9, 89.1, { fetchFn: okFetch(goodDaily) });
    expect(first.stale).toBe(false);
    // 2) network dies -> we return the cached real data, flagged stale (never invented)
    const { fn } = failFetch();
    const second = await getForecast(23.9, 89.1, { fetchFn: fn });
    expect(second.stale).toBe(true);
    expect(second.totalRainNext7Mm).toBe(first.totalRainNext7Mm);
  });
});
