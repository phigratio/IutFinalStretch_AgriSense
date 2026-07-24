/**
 * Cross-platform auth-token store for the mobile app. Uses localStorage on web
 * (where the demo runs and gives "returning farmer" persistence across
 * reloads) and an in-memory fallback on native Expo Go (no extra native dep).
 * Consumed by api/client.ts (attaches the bearer token) and state/auth.tsx.
 */
const KEY = "agrisense.token";
let memoryToken: string | null = null;

function webStorage(): Storage | null {
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return webStorage()?.getItem(KEY) ?? memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
  webStorage()?.setItem(KEY, token);
}

export function clearToken(): void {
  memoryToken = null;
  webStorage()?.removeItem(KEY);
}
