/**
 * Tiny JSON fetch wrapper for all backend calls: base-url resolution,
 * timeout, and readable errors. Consumed by src/api/agrisense.ts + payments.ts.
 */
import { apiBaseUrl } from "./config";
import { getToken } from "./tokenStore";

const TIMEOUT_MS = 60_000; // agent turns call the LLM + tools; give them room

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const url = `${apiBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    if (init?.body !== undefined) headers["Content-Type"] = "application/json";
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const message =
        (body as { error?: string } | undefined)?.error ?? `${res.status} from ${path}`;
      throw new ApiError(message, res.status, body);
    }
    return body as T;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new ApiError(`Timed out after ${TIMEOUT_MS / 1000}s: ${path}`);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(`Network error calling ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** GET /health — used by the connection banner on first launch. */
export async function pingBackend(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await apiFetch<{ status: string }>("/health");
    return { ok: res.status === "ok", detail: apiBaseUrl() };
  } catch (err) {
    return { ok: false, detail: `${apiBaseUrl()} — ${(err as Error).message}` };
  }
}
