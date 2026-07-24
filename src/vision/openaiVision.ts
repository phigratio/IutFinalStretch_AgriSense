/**
 * OpenAI vision fallback for leaf diagnosis (Tier-2 T2-4). Used when the HuggingFace
 * classifier is unavailable, unsure, or doesn't cover the farmer's crop (e.g. rice,
 * which PlantVillage models don't include). The farmer's crop/location/season/weather
 * are injected to ground the answer, and strict JSON is returned. Always paired with
 * a caution message by the caller — this is an AI visual estimate, not a lab test.
 * Raw fetch (no SDK); `fetchFn` injectable for tests.
 */
import { config } from "../config.js";

export interface VisionContext {
  crop?: string;
  locationText?: string;
  targetSeason?: string;
  growthStage?: string;
  weatherSummary?: string;
}

export interface OpenAiLeafDiagnosis {
  isLeaf: boolean;
  crop: string;
  disease: string;
  confidence: number;
  severity: "none" | "low" | "medium" | "high";
  symptoms: string;
  differentials: string[];
  treatment: string;
  prevention: string;
  notes: string;
}

export type ChatFetch = (url: string, init: RequestInit) => Promise<Response>;

export class OpenAiVisionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAiVisionUnavailableError";
  }
}

const SYSTEM_PROMPT = [
  "You are a plant pathologist assisting smallholder farmers in Bangladesh through AgriSense.",
  "You are shown ONE photo of a plant leaf/stem and some context about the farm.",
  "Identify the single most likely disease or pest, honestly reflecting uncertainty.",
  "Prefer locally available, DAE/SAAO-aligned advice. Do not invent a precise chemical dose.",
  "If the image is not a diagnosable plant leaf (blurry, wrong subject), set isLeaf=false.",
  "Respond with ONLY a JSON object of this exact shape:",
  '{"isLeaf":boolean,"crop":string,"disease":string,"confidence":number,' +
    '"severity":"none"|"low"|"medium"|"high","symptoms":string,' +
    '"differentials":string[],"treatment":string,"prevention":string,"notes":string}',
  "confidence is 0..1. disease is a short name (or 'Healthy' / 'Uncertain').",
].join(" ");

export class OpenAiLeafVision {
  constructor(
    private readonly apiKey = config.openaiApiKey,
    private readonly model = config.openaiVisionModel,
    private readonly fetchFn: ChatFetch = fetch,
  ) {}

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async diagnose(input: {
    imageBuffer: Buffer;
    mimeType: string;
    context: VisionContext;
  }): Promise<OpenAiLeafDiagnosis> {
    if (!this.apiKey) throw new OpenAiVisionUnavailableError("OPENAI_API_KEY is not set");
    const dataUrl = `data:${input.mimeType || "image/jpeg"};base64,${input.imageBuffer.toString("base64")}`;

    const res = await this.fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: buildContextText(input.context) },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new OpenAiVisionUnavailableError(`OpenAI vision failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
    }
    return parseOpenAiVisionResponse(await res.text());
  }
}

/** Compose the grounding context the model should reason with (never fabricates it). */
export function buildContextText(context: VisionContext): string {
  const lines = [
    "Diagnose the leaf in the attached photo.",
    context.crop ? `The farmer's crop is: ${context.crop}.` : "The farmer's crop is unknown.",
    context.locationText ? `Location: ${context.locationText}.` : "",
    context.targetSeason ? `Season: ${context.targetSeason}.` : "",
    context.growthStage ? `Growth stage: ${context.growthStage}.` : "",
    context.weatherSummary ? `Recent weather: ${context.weatherSummary}.` : "",
    "If the visible symptoms clearly do not match that crop, trust the image and say so in notes.",
  ];
  return lines.filter(Boolean).join(" ");
}

/** Pure: parse the chat-completions JSON body into a normalized diagnosis. */
export function parseOpenAiVisionResponse(responseBody: string): OpenAiLeafDiagnosis {
  const body = JSON.parse(responseBody) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content ?? "{}";
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content) as Record<string, unknown>;
  } catch {
    raw = {};
  }

  const severityRaw = String(raw.severity ?? "").toLowerCase();
  const severity = (["none", "low", "medium", "high"] as readonly string[]).includes(severityRaw)
    ? (severityRaw as OpenAiLeafDiagnosis["severity"])
    : "medium";

  return {
    isLeaf: raw.isLeaf !== false,
    crop: String(raw.crop ?? "unknown"),
    disease: String(raw.disease ?? "Uncertain"),
    confidence: clamp01(Number(raw.confidence ?? 0.5)),
    severity,
    symptoms: String(raw.symptoms ?? ""),
    differentials: Array.isArray(raw.differentials) ? raw.differentials.map(String).slice(0, 5) : [],
    treatment: String(raw.treatment ?? ""),
    prevention: String(raw.prevention ?? ""),
    notes: String(raw.notes ?? ""),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

export const openAiLeafVision = new OpenAiLeafVision();
