/**
 * LLM adapter (B2). OpenAI is the sole agent-chat provider (D3). The model's only intake job is
 * EXTRACTION — turn a farmer message (English or Bangla) into structured fields. It never does
 * arithmetic, ranking, or date math. A heuristic offline extractor is provided as a fallback so
 * the pipeline runs without a key (and for deterministic tests).
 */

import { config } from "../config.js";
import type { Extractor, ExtractedFields, IntakeState } from "../agent/intake.js";
import {
  normalizeAreaText,
  normalizeSoilTexture,
  normalizeSeasonAlias,
  bengaliToLatinDigits,
} from "../agent/normalize.js";
import { normalizeWater } from "../agent/intake.js";
import { loadTable } from "../data/loader.js";

export type ChatFetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "extract_farm_fields",
    description: "Extract any farm-profile fields present in the farmer's message.",
    parameters: {
      type: "object",
      properties: {
        district: { type: "string", description: "Bangladesh district name in English" },
        upazila: { type: "string" },
        locationText: { type: "string" },
        areaValue: { type: "number" },
        areaUnit: { type: "string", enum: ["acre", "decimal", "bigha", "kani", "ha", "hectare"] },
        soilText: { type: "string", description: "soil words as said, e.g. loam/দোআঁশ/clay" },
        soilTestFertility: { type: "string", enum: ["low", "medium", "high"] },
        overrideFertility: { type: "string", enum: ["low", "medium", "high"] },
        waterText: { type: "string", description: "water source words as said" },
        budgetBdt: { type: "number", description: "budget in BDT (taka)" },
        seasonText: { type: "string", description: "season as said, e.g. Aman/Boro/Rabi/Aus" },
        currentCrop: { type: "string" },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are the intake extractor for AgriSense, an advisor for Bangladeshi smallholder farmers.
Extract ONLY fields explicitly present in the farmer's latest message. Do not guess or infer.
Understand Bangla ("২ বিঘা", "দোআঁশ মাটি", "রোপা আমন"). Return values via the extract_farm_fields tool.
Do not perform any calculations.`;

/** Pure: turn an OpenAI chat-completions response body into ExtractedFields. */
export function parseExtractionToolCall(responseBody: string): ExtractedFields {
  const body = JSON.parse(responseBody) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args = body.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return {};
  try {
    return JSON.parse(args) as ExtractedFields;
  } catch {
    return {};
  }
}

const defaultChatFetch: ChatFetch = (url, init) => fetch(url, init) as unknown as ReturnType<ChatFetch>;

export class OpenAIExtractor implements Extractor {
  constructor(
    private readonly apiKey: string,
    private readonly model = config.openaiChatModel,
    private readonly fetchFn: ChatFetch = defaultChatFetch,
  ) {}

  async extract(message: string, current: IntakeState): Promise<ExtractedFields> {
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
          { role: "system", content: `Known fields so far (do not re-extract unless corrected): ${JSON.stringify(current)}` },
          { role: "user", content: message },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "function", function: { name: "extract_farm_fields" } },
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI extract failed: HTTP ${res.status}`);
    return parseExtractionToolCall(await res.text());
  }
}

/**
 * Deterministic offline extractor — regex/keyword based. Good enough to demo without a key and
 * used in tests. Leans on the same normalizers the merge step uses.
 */
export class HeuristicExtractor implements Extractor {
  private districts = loadTable("srdi_fertility.csv").map((r) => r.district);

  async extract(message: string): Promise<ExtractedFields> {
    const ex: ExtractedFields = {};
    const latin = bengaliToLatinDigits(message);

    const area = normalizeAreaText(message);
    if (area) {
      ex.areaValue = area.original.value;
      ex.areaUnit = area.original.unit;
    }

    if (normalizeSoilTexture(message) !== "unknown") ex.soilText = message;
    if (normalizeSeasonAlias(message)) ex.seasonText = message;
    if (normalizeWater(message)) ex.waterText = message;

    const district = this.districts.find((d) => new RegExp(`\\b${d}\\b`, "i").test(latin));
    if (district) ex.district = district;

    const budget = parseBudget(latin);
    if (budget != null) ex.budgetBdt = budget;

    return ex;
  }
}

/** Parse "80,000 taka", "80k", "80 thousand", "1 lakh", "৳80000", "budget 80000", "tk 50000". */
export function parseBudget(text: string): number | null {
  // money word BEFORE the amount, e.g. "budget 80000", "tk 50000"
  let m = text.match(/(?:tk|taka|৳|bdt|budget|টাকা)\s*:?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|hazar)?/i);
  // else amount FOLLOWED by a money/scale word, e.g. "80,000 taka", "80k", "1 lakh"
  if (!m) m = text.match(/([\d,]+(?:\.\d+)?)\s*(k|thousand|lakh|lac|hazar|tk|taka|৳|bdt|টাকা)\b/i);
  if (!m) return null;
  let value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const scale = (m[2] ?? "").toLowerCase();
  if (scale === "k" || scale === "thousand" || scale === "hazar") value *= 1000;
  if (scale === "lakh" || scale === "lac") value *= 100000;
  return value;
}

export function getDefaultExtractor(): Extractor {
  return config.openaiApiKey
    ? new OpenAIExtractor(config.openaiApiKey)
    : new HeuristicExtractor();
}
