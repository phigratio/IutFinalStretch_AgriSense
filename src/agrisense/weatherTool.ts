/**
 * Open-Meteo weather tool for Tier-0 live grounding. It geocodes a farmer's
 * location and fetches real daily rainfall/temperature forecast values.
 */
import { type WeatherForecast } from "./types.js";

interface GeocodeResult {
  name: string;
  admin1?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

interface GeocodeResponse {
  results?: GeocodeResult[];
}

/**
 * Our farmers are in Bangladesh, so geocoding must prefer BD matches:
 * a bare `count=1` lookup famously resolves "Bogura" to a village in Russia.
 * Renamed districts also need their old names, which Open-Meteo still indexes.
 */
const BD_NAME_ALIASES: Record<string, string> = {
  bogura: "Bogra",
  chattogram: "Chittagong",
  cumilla: "Comilla",
  barishal: "Barisal",
  jashore: "Jessore",
};

async function geocodeBangladeshFirst(locationText: string): Promise<GeocodeResult> {
  const cleaned = locationText.trim();
  const attempts = [cleaned];
  const alias = BD_NAME_ALIASES[cleaned.toLowerCase()];
  if (alias) attempts.push(alias);

  let firstAnyMatch: GeocodeResult | undefined;
  for (const name of attempts) {
    const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
    geocodeUrl.searchParams.set("name", name);
    geocodeUrl.searchParams.set("count", "10");
    geocodeUrl.searchParams.set("language", "en");
    geocodeUrl.searchParams.set("format", "json");
    const geocode = await fetchJson<GeocodeResponse>(geocodeUrl);
    const results = geocode.results ?? [];
    firstAnyMatch ??= results[0];
    const bdMatch = results.find((r) => r.country_code === "BD");
    if (bdMatch) return bdMatch;
  }
  if (firstAnyMatch) return firstAnyMatch; // non-BD fallback: better than failing
  throw new Error(`No geocoding result found for ${locationText}`);
}

interface ForecastResponse {
  daily?: {
    time: string[];
    precipitation_sum: number[];
    temperature_2m_min: number[];
    temperature_2m_max: number[];
    relative_humidity_2m_mean?: number[];
    et0_fao_evapotranspiration?: number[];
    soil_moisture_0_to_10cm_mean?: number[];
  };
}

export async function getWeatherForecast(locationText: string): Promise<WeatherForecast> {
  return getWeatherForecastForLocation({ locationText });
}

export async function getWeatherForecastForLocation(input: {
  locationText: string;
  latitude?: number;
  longitude?: number;
}): Promise<WeatherForecast> {
  const result = isCoordinate(input.latitude) && isCoordinate(input.longitude)
    ? {
        name: input.locationText.trim() || "Device location",
        country: "Bangladesh",
        country_code: "BD",
        latitude: input.latitude,
        longitude: input.longitude,
      }
    : await geocodeBangladeshFirst(input.locationText);

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.searchParams.set("latitude", String(result.latitude));
  forecastUrl.searchParams.set("longitude", String(result.longitude));
  forecastUrl.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean,et0_fao_evapotranspiration,soil_moisture_0_to_10cm_mean",
  );
  forecastUrl.searchParams.set("timezone", "Asia/Dhaka");
  forecastUrl.searchParams.set("forecast_days", "7");

  const forecast = await fetchJson<ForecastResponse>(forecastUrl);
  const daily = forecast.daily;
  if (!daily) {
    throw new Error("Open-Meteo response did not include daily forecast");
  }

  return {
    provider: "open-meteo",
    locationText: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
    latitude: result.latitude,
    longitude: result.longitude,
    daily: daily.time.map((date, index) => ({
      date,
      rainfallMm: Number(daily.precipitation_sum[index] ?? 0),
      temperatureMinC: Number(daily.temperature_2m_min[index] ?? 0),
      temperatureMaxC: Number(daily.temperature_2m_max[index] ?? 0),
      humidityPct: toOptionalNumber(daily.relative_humidity_2m_mean?.[index]),
      referenceEvapotranspirationMm: toOptionalNumber(daily.et0_fao_evapotranspiration?.[index]),
      soilMoisture0To9cm: toOptionalNumber(daily.soil_moisture_0_to_10cm_mean?.[index]),
    })),
    raw: { geocode: result, forecast },
  };
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with ${response.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

export function mockWeatherForecast(locationText: string): WeatherForecast {
  const today = new Date();
  return {
    provider: "mock",
    locationText,
    latitude: 23.9999,
    longitude: 90.4203,
    daily: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setUTCDate(today.getUTCDate() + index);
      return {
        date: date.toISOString().slice(0, 10),
        rainfallMm: [4.2, 0, 2.1, 8, 1.5, 0, 3][index]!,
        temperatureMinC: [25, 25.5, 26, 25.8, 26.2, 25.9, 26.1][index]!,
        temperatureMaxC: [32, 33, 32.5, 31.2, 32.8, 33.1, 32.7][index]!,
        humidityPct: [82, 78, 80, 86, 79, 76, 81][index]!,
        referenceEvapotranspirationMm: [3.4, 3.8, 3.5, 2.9, 3.6, 3.9, 3.4][index]!,
        soilMoisture0To9cm: [0.31, 0.29, 0.3, 0.34, 0.31, 0.28, 0.3][index]!,
      };
    }),
    raw: { mock: true },
  };
}

function toOptionalNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Number(value) : undefined;
}
