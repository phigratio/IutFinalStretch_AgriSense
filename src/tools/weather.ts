/**
 * Weather grounding tools (T0-2). Three Open-Meteo calls: geocode, 16-day forecast, and
 * historical normals (a real archive call, averaged by month in code — never presented as a
 * forecast). Pure parsers are separated from the fetch layer so they can be tested without a
 * network. Failure policy: retry once, then serve stale-but-real cache if we have it, else throw
 * — never invent numbers (spec §2). Tracing is applied by the orchestrator via `withTrace`.
 */

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface WeatherDeps {
  fetchFn?: FetchFn;
  now?: () => Date;
}

export class WeatherUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherUnavailableError";
  }
}

// ---- Types ------------------------------------------------------------------

export interface GeocodeResult {
  lat: number;
  lon: number;
  matchedName: string;
  admin1: string;
  sourceUrl: string;
  retrievedAt: string;
}

export interface DailyForecast {
  date: string;
  rainMm: number;
  tminC: number;
  tmaxC: number;
}

export interface ForecastResult {
  daily: DailyForecast[];
  totalRainNext7Mm: number;
  totalRainNext16Mm: number;
  tmeanNext7C: number;
  sourceUrl: string;
  retrievedAt: string;
  stale: boolean;
}

export interface MonthlyNormal {
  month: number;
  avgRainMm: number;
  avgTminC: number;
  avgTmaxC: number;
}

export interface NormalsResult {
  monthly: MonthlyNormal[];
  yearsUsed: string;
  sourceUrl: string;
  retrievedAt: string;
  stale: boolean;
}

// ---- Pure parsers -----------------------------------------------------------

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function parseGeocode(json: unknown, sourceUrl: string, retrievedAt: string): GeocodeResult | null {
  const results = (json as { results?: Record<string, unknown>[] })?.results;
  const top = results?.[0];
  if (!top) return null;
  return {
    lat: Number(top.latitude),
    lon: Number(top.longitude),
    matchedName: String(top.name ?? ""),
    admin1: String(top.admin1 ?? ""),
    sourceUrl,
    retrievedAt,
  };
}

interface OpenMeteoDaily {
  daily?: {
    time?: string[];
    precipitation_sum?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

export function parseForecast(json: unknown, sourceUrl: string, retrievedAt: string): ForecastResult {
  const d = (json as OpenMeteoDaily).daily ?? {};
  const time = d.time ?? [];
  const rain = d.precipitation_sum ?? [];
  const tmax = d.temperature_2m_max ?? [];
  const tmin = d.temperature_2m_min ?? [];

  const daily: DailyForecast[] = time.map((date, i) => ({
    date,
    rainMm: rain[i] ?? 0,
    tminC: tmin[i] ?? 0,
    tmaxC: tmax[i] ?? 0,
  }));

  const next7 = daily.slice(0, 7);
  const next16 = daily.slice(0, 16);
  return {
    daily,
    totalRainNext7Mm: round(next7.reduce((a, b) => a + b.rainMm, 0)),
    totalRainNext16Mm: round(next16.reduce((a, b) => a + b.rainMm, 0)),
    tmeanNext7C: round(mean(next7.map((x) => (x.tmaxC + x.tminC) / 2))),
    sourceUrl,
    retrievedAt,
    stale: false,
  };
}

/** Average archive daily data into monthly normals for the requested months. */
export function parseNormals(
  json: unknown,
  months: number[],
  yearsUsed: string,
  sourceUrl: string,
  retrievedAt: string,
): NormalsResult {
  const d = (json as OpenMeteoDaily).daily ?? {};
  const time = d.time ?? [];
  const rain = d.precipitation_sum ?? [];
  const tmax = d.temperature_2m_max ?? [];
  const tmin = d.temperature_2m_min ?? [];

  // Per (year, month) rain total; per month temp samples.
  const rainByYearMonth = new Map<string, number>();
  const tminByMonth = new Map<number, number[]>();
  const tmaxByMonth = new Map<number, number[]>();

  time.forEach((dateStr, i) => {
    const dt = new Date(dateStr);
    const m = dt.getUTCMonth() + 1;
    const y = dt.getUTCFullYear();
    const key = `${y}-${m}`;
    rainByYearMonth.set(key, (rainByYearMonth.get(key) ?? 0) + (rain[i] ?? 0));
    if (!tminByMonth.has(m)) tminByMonth.set(m, []);
    if (!tmaxByMonth.has(m)) tmaxByMonth.set(m, []);
    tminByMonth.get(m)!.push(tmin[i] ?? 0);
    tmaxByMonth.get(m)!.push(tmax[i] ?? 0);
  });

  const monthly: MonthlyNormal[] = months.map((month) => {
    const monthTotals: number[] = [];
    for (const [key, total] of rainByYearMonth) {
      if (Number(key.split("-")[1]) === month) monthTotals.push(total);
    }
    return {
      month,
      avgRainMm: round(mean(monthTotals)),
      avgTminC: round(mean(tminByMonth.get(month) ?? [])),
      avgTmaxC: round(mean(tmaxByMonth.get(month) ?? [])),
    };
  });

  return { monthly, yearsUsed, sourceUrl, retrievedAt, stale: true };
}

// ---- Fetch layer (retry once, stale cache, never invent) --------------------

async function fetchJson(url: string, fetchFn: FetchFn): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetchFn(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const forecastCache = new Map<string, ForecastResult>();
const normalsCache = new Map<string, NormalsResult>();

const defaultFetch: FetchFn = (url) => fetch(url) as unknown as ReturnType<FetchFn>;

export async function geocodeLocation(text: string, deps: WeatherDeps = {}): Promise<GeocodeResult> {
  const fetchFn = deps.fetchFn ?? defaultFetch;
  const now = deps.now ?? (() => new Date());
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=5&language=en&format=json`;
  const json = await fetchJson(url, fetchFn);
  const parsed = parseGeocode(json, url, now().toISOString());
  if (!parsed) throw new WeatherUnavailableError(`No geocoding match for "${text}"`);
  return parsed;
}

export async function getForecast(lat: number, lon: number, deps: WeatherDeps = {}): Promise<ForecastResult> {
  const fetchFn = deps.fetchFn ?? defaultFetch;
  const now = deps.now ?? (() => new Date());
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&forecast_days=16&timezone=auto`;
  try {
    const json = await fetchJson(url, fetchFn);
    const parsed = parseForecast(json, url, now().toISOString());
    forecastCache.set(key, parsed);
    return parsed;
  } catch (err) {
    const cached = forecastCache.get(key);
    if (cached) return { ...cached, stale: true };
    throw new WeatherUnavailableError(
      `Weather forecast unavailable and no cached value: ${(err as Error).message}`,
    );
  }
}

export async function getClimateNormals(
  lat: number,
  lon: number,
  months: number[],
  deps: WeatherDeps = {},
): Promise<NormalsResult> {
  const fetchFn = deps.fetchFn ?? defaultFetch;
  const now = deps.now ?? (() => new Date());
  const startYear = 2016;
  const endYear = 2025;
  const yearsUsed = `${startYear}–${endYear}`;
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}:${months.join(",")}`;
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${startYear}-01-01&end_date=${endYear}-12-31` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto`;
  try {
    const json = await fetchJson(url, fetchFn);
    const parsed = parseNormals(json, months, yearsUsed, url, now().toISOString());
    normalsCache.set(key, parsed);
    return parsed;
  } catch (err) {
    const cached = normalsCache.get(key);
    if (cached) return { ...cached, stale: true };
    throw new WeatherUnavailableError(
      `Climate normals unavailable and no cached value: ${(err as Error).message}`,
    );
  }
}

/** Test helper. */
export function _clearWeatherCache(): void {
  forecastCache.clear();
  normalsCache.clear();
}
