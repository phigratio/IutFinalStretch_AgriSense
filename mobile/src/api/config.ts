/**
 * Backend base-URL resolution for the mobile app.
 * Priority:
 *   1. EXPO_PUBLIC_API_URL (mobile/.env) — explicit override.
 *   2. A real LAN Metro host (Expo Go on a device with the backend on the same
 *      laptop) — http://<lan-ip>:3000.
 *   3. The hosted VPS backend (default) — so Expo web and any device without a
 *      local backend just work.
 * Consumed by every src/api/* module.
 */
import Constants from "expo-constants";

const DEFAULT_PORT = 3000;

/** Hosted backend (see deploy/README.md). For local dev, set EXPO_PUBLIC_API_URL. */
const HOSTED_API_URL = "https://agrisense.72.62.247.199.nip.io";

function metroHost(): string | undefined {
  // e.g. "192.168.0.103:8081" when running via Expo Go on a device.
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(":")[0];
  // Ignore localhost / web — those can't reach a laptop backend on Expo web.
  if (!host || host === "" || host === "localhost" || host === "127.0.0.1") return undefined;
  return host;
}

export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.replace(/\/$/, "");
  const host = metroHost();
  if (host) return `http://${host}:${DEFAULT_PORT}`;
  return HOSTED_API_URL;
}
