/**
 * Backend base-URL resolution for the mobile app.
 * Priority: EXPO_PUBLIC_API_URL (.env) > the Metro bundler host (same laptop
 * that serves Expo also runs the Express backend — zero-config on hotspot) >
 * localhost (web preview). Consumed by every src/api/* module.
 */
import Constants from "expo-constants";

const DEFAULT_PORT = 3000;

function metroHost(): string | undefined {
  // e.g. "192.168.0.103:8081" when running via Expo Go on a device.
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(":")[0];
  return host && host !== "" ? host : undefined;
}

export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.replace(/\/$/, "");
  const host = metroHost();
  if (host) return `http://${host}:${DEFAULT_PORT}`;
  return `http://localhost:${DEFAULT_PORT}`;
}
