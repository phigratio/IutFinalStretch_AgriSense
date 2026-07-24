import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { IntakeProfile, WeatherForecast } from "../../api/agrisense.js";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2xUrl,
  iconUrl: markerIconUrl,
  shadowUrl: markerShadowUrl,
});

interface FarmWeatherMapProps {
  title?: string;
  profile?: IntakeProfile;
  weather?: WeatherForecast;
  cropLabel?: string;
  riskLabel?: string;
  className?: string;
}

export default function FarmWeatherMap({
  title = "Farm Map",
  profile,
  weather,
  cropLabel,
  riskLabel,
  className = "",
}: FarmWeatherMapProps) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const point = useMemo(() => resolvePoint(profile, weather), [profile, weather]);
  const summary = useMemo(() => summarizeWeather(weather), [weather]);

  useEffect(() => {
    if (!point || !mapEl.current) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapEl.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapRef.current);
    }

    const latLng: L.LatLngExpression = [point.latitude, point.longitude];
    mapRef.current.setView(latLng, point.source === "profile" ? 12 : 10);

    const popup = [
      `<strong>${escapeHtml(profile?.locationText ?? weather?.locationText ?? "Farm location")}</strong>`,
      cropLabel ? `Crop: ${escapeHtml(cropLabel)}` : undefined,
      summary ? `7-day rain: ${summary.rain7dMm} mm` : undefined,
      summary ? `Temp: ${summary.minTempC}-${summary.maxTempC}C` : undefined,
      summary?.humidityPct ? `Humidity: ${summary.humidityPct}%` : undefined,
      riskLabel ? `Risk: ${escapeHtml(riskLabel)}` : undefined,
      `Source: ${point.source === "profile" ? "farm profile" : weather?.provider ?? "weather geocode"}`,
    ].filter(Boolean).join("<br />");

    if (!markerRef.current) {
      markerRef.current = L.marker(latLng).addTo(mapRef.current);
    } else {
      markerRef.current.setLatLng(latLng);
    }
    markerRef.current.bindPopup(popup);

    const resize = window.setTimeout(() => mapRef.current?.invalidateSize(), 120);
    return () => window.clearTimeout(resize);
  }, [point, profile?.locationText, weather, cropLabel, riskLabel, summary]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
    markerRef.current = null;
  }, []);

  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {point ? `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)} · ${point.source === "profile" ? "profile coordinates" : "weather geocode"}` : "Coordinates are not available yet."}
          </p>
        </div>
        {weather && (
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
            {weather.provider}
          </span>
        )}
      </div>

      {point ? (
        <div ref={mapEl} className="mt-3 h-64 overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-800" />
      ) : (
        <div className="mt-3 flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          Run weather or save farm coordinates to place this farmer on the map.
        </div>
      )}

      {summary && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniMetric label="Rain 7d" value={`${summary.rain7dMm} mm`} />
          <MiniMetric label="Temp" value={`${summary.minTempC}-${summary.maxTempC}C`} />
          <MiniMetric label="Humidity" value={summary.humidityPct ? `${summary.humidityPct}%` : "n/a"} />
        </div>
      )}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function resolvePoint(profile?: IntakeProfile, weather?: WeatherForecast) {
  if (isCoordinate(profile?.latitude) && isCoordinate(profile?.longitude)) {
    return { latitude: profile.latitude, longitude: profile.longitude, source: "profile" as const };
  }
  if (isCoordinate(weather?.latitude) && isCoordinate(weather?.longitude)) {
    return { latitude: weather.latitude, longitude: weather.longitude, source: "weather" as const };
  }
  return undefined;
}

function summarizeWeather(weather?: WeatherForecast) {
  if (!weather?.daily.length) return undefined;
  const days = weather.daily.slice(0, 7);
  const humidity = days.map((day) => day.humidityPct).filter(isCoordinate);
  return {
    rain7dMm: round1(days.reduce((sum, day) => sum + day.rainfallMm, 0)),
    minTempC: round1(Math.min(...days.map((day) => day.temperatureMinC))),
    maxTempC: round1(Math.max(...days.map((day) => day.temperatureMaxC))),
    humidityPct: humidity.length ? Math.round(humidity.reduce((sum, value) => sum + value, 0) / humidity.length) : undefined,
  };
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
