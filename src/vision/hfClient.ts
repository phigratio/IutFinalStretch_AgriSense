/**
 * HuggingFace serverless image-classification client for the plant-disease model
 * (default: linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification). Raw
 * fetch — no SDK — to match the repo's OpenAI/mem0 style; `fetchFn` is injectable
 * so the leaf-diagnosis service tests run without a network. Handles the model
 * cold-start (HTTP 503 + estimated_time) with a bounded retry. Primary path of the
 * Tier-2 leaf-disease feature; failures raise and the service falls back to OpenAI.
 */
import { config } from "../config.js";

export interface HfClassification {
  label: string;
  score: number;
}

export type HfFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface HfClassifyInput {
  imageBuffer: Buffer;
  mimeType: string;
}

export class HuggingFaceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HuggingFaceUnavailableError";
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class PlantDiseaseClassifier {
  constructor(
    private readonly token = config.hfToken,
    private readonly model = config.hfPlantDiseaseModel,
    private readonly baseUrl = config.hfInferenceBaseUrl,
    private readonly fetchFn: HfFetch = fetch,
    private readonly maxRetries = 2,
  ) {}

  /** True when a token is present — otherwise the service skips straight to fallback. */
  get configured(): boolean {
    return Boolean(this.token);
  }

  async classify(input: HfClassifyInput): Promise<HfClassification[]> {
    if (!this.token) throw new HuggingFaceUnavailableError("HF_TOKEN is not set");
    const url = `${this.baseUrl.replace(/\/$/, "")}/${this.model}`;
    let lastError = "HuggingFace classification failed";

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": input.mimeType || "application/octet-stream",
          Accept: "application/json",
        },
        body: new Uint8Array(input.imageBuffer),
      });

      const text = await res.text();
      if (res.ok) return parseClassifications(text);

      const payload = safeJson(text) as { error?: unknown; estimated_time?: unknown } | null;
      lastError = typeof payload?.error === "string" ? payload.error : `HuggingFace HTTP ${res.status}`;
      const loading = res.status === 503 || /loading/i.test(String(payload?.error ?? ""));
      if (loading && attempt < this.maxRetries) {
        const estimated = typeof payload?.estimated_time === "number" ? payload.estimated_time : 8;
        await sleep(Math.min(estimated * 1000, 15_000));
        continue;
      }
      throw new HuggingFaceUnavailableError(lastError);
    }

    throw new HuggingFaceUnavailableError(lastError);
  }
}

/** Normalize the several response shapes HF may return into a sorted top-first list. */
export function parseClassifications(responseBody: string): HfClassification[] {
  const parsed = safeJson(responseBody);
  if (parsed === null || parsed === undefined) {
    throw new HuggingFaceUnavailableError("HuggingFace returned a non-JSON response");
  }
  const errorValue = (parsed as { error?: unknown }).error;
  if (typeof errorValue === "string") throw new HuggingFaceUnavailableError(errorValue);

  // Either [{label,score}, ...] or nested [[{label,score}, ...]].
  const list = Array.isArray(parsed)
    ? Array.isArray(parsed[0])
      ? (parsed[0] as unknown[])
      : (parsed as unknown[])
    : [];

  const items = list
    .map((row) => {
      const record = row as { label?: unknown; score?: unknown };
      return { label: String(record.label ?? ""), score: Number(record.score ?? 0) };
    })
    .filter((item) => item.label && Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);

  if (!items.length) throw new HuggingFaceUnavailableError("HuggingFace returned no classifications");
  return items;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export const plantDiseaseClassifier = new PlantDiseaseClassifier();
