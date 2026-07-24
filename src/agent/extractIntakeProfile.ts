/**
 * OpenAI-backed intake extraction for T0-1. It returns only durable profile
 * facts; deterministic code merges and decides follow-up gaps.
 */
import { config } from "../config.js";
import { type IntakeProfile, type IntakeProfilePatch } from "./intakeSchema.js";

export interface IntakeExtractor {
  extract(message: string, currentProfile: IntakeProfile): Promise<IntakeProfilePatch>;
}

interface ResponsesApiOutputText {
  type: "output_text";
  text: string;
}

interface ResponsesApiMessage {
  type: "message";
  content?: ResponsesApiOutputText[];
}

interface ResponsesApiResponse {
  output?: ResponsesApiMessage[];
  output_text?: string;
}

const intakeJsonSchema = {
  name: "agrisense_intake_patch",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      farmerName: { type: ["string", "null"] },
      bdappsMobile: { type: ["string", "null"] },
      preferredLanguage: { type: ["string", "null"], enum: ["en", "bn", null] },
      locationText: { type: ["string", "null"] },
      latitude: { type: ["number", "null"] },
      longitude: { type: ["number", "null"] },
      sizeAcres: { type: ["number", "null"] },
      sizeOriginal: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            properties: {
              value: { type: "number" },
              unit: { type: "string", enum: ["acre", "bigha", "decimal"] },
            },
            required: ["value", "unit"],
          },
          { type: "null" },
        ],
      },
      soilType: { type: ["string", "null"] },
      waterAvailability: { type: ["string", "null"] },
      budgetBdt: { type: ["number", "null"] },
      targetSeason: { type: ["string", "null"] },
      currentCrop: { type: ["string", "null"] },
      confidence: { type: "number" },
      notes: { type: "array", items: { type: "string" } },
    },
    required: [
      "farmerName",
      "bdappsMobile",
      "preferredLanguage",
      "locationText",
      "latitude",
      "longitude",
      "sizeAcres",
      "sizeOriginal",
      "soilType",
      "waterAvailability",
      "budgetBdt",
      "targetSeason",
      "currentCrop",
      "confidence",
      "notes",
    ],
  },
};

export class OpenAiIntakeExtractor implements IntakeExtractor {
  constructor(
    private readonly apiKey = config.openaiApiKey,
    private readonly model = config.openaiIntakeModel,
  ) {}

  async extract(message: string, currentProfile: IntakeProfile): Promise<IntakeProfilePatch> {
    if (!this.apiKey) {
      return heuristicExtract(message);
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        instructions: [
          "You extract durable farm intake facts for AgriSense AI.",
          "Return only facts explicitly stated or safely normalized from the user's message.",
          "Normalize Bangladeshi units: 1 acre = 3 bigha, 1 acre = 100 decimal.",
          "Do not infer missing soil, water, budget, season, or location.",
          "Use BDT for budget. If the user says 45k, output 45000.",
          "Valid water examples: rainfed, tubewell, canal, pond, mixed.",
          "Valid season examples: Aman, Boro, Aus, Rabi, Kharif-1, Kharif-2.",
        ].join("\n"),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  currentProfile,
                  farmerMessage: message,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            ...intakeJsonSchema,
          },
        },
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI intake extraction failed with ${response.status}: ${text}`);
    }

    return stripNulls(JSON.parse(extractOutputText(JSON.parse(text) as ResponsesApiResponse)) as IntakeProfilePatch);
  }
}

export class HeuristicIntakeExtractor implements IntakeExtractor {
  async extract(message: string, _currentProfile?: IntakeProfile): Promise<IntakeProfilePatch> {
    return heuristicExtract(message);
  }
}

function extractOutputText(response: ResponsesApiResponse): string {
  if (response.output_text) return response.output_text;

  for (const item of response.output ?? []) {
    const text = item.content?.find((content) => content.type === "output_text")?.text;
    if (text) return text;
  }

  throw new Error("OpenAI response did not contain output text");
}

function stripNulls(patch: IntakeProfilePatch): IntakeProfilePatch {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }
  return result as IntakeProfilePatch;
}

function heuristicExtract(message: string): IntakeProfilePatch {
  const text = message.toLowerCase();
  const patch: IntakeProfilePatch = { confidence: 0.45, notes: ["heuristic fallback used"] };

  const location = message.match(/\b(?:in|at|from|near)\s+([A-Z][A-Za-z -]{2,})/)?.[1];
  if (location) patch.locationText = location.trim();

  const acre = text.match(/(\d+(?:\.\d+)?)\s*(?:acre|acres)/);
  const bigha = text.match(/(\d+(?:\.\d+)?)\s*(?:bigha|biga)/);
  const decimal = text.match(/(\d+(?:\.\d+)?)\s*(?:decimal|shotok)/);
  if (acre) {
    patch.sizeAcres = Number(acre[1]);
    patch.sizeOriginal = { value: Number(acre[1]), unit: "acre" };
  } else if (bigha) {
    patch.sizeAcres = Number(bigha[1]) / 3;
    patch.sizeOriginal = { value: Number(bigha[1]), unit: "bigha" };
  } else if (decimal) {
    patch.sizeAcres = Number(decimal[1]) / 100;
    patch.sizeOriginal = { value: Number(decimal[1]), unit: "decimal" };
  }

  for (const soil of ["sandy loam", "sandy-loam", "clay loam", "clay-loam", "sandy", "loam", "clay", "silt"]) {
    if (text.includes(soil)) patch.soilType = soil.replace("-", " ");
  }

  for (const water of ["rainfed", "tubewell", "tube well", "canal", "pond", "mixed"]) {
    if (text.includes(water)) patch.waterAvailability = water.replace("tube well", "tubewell");
  }

  const budget = text.match(/(?:budget|৳|tk|bdt)\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh)?/);
  if (budget) {
    const raw = Number(budget[1]);
    patch.budgetBdt = budget[2] === "lakh" ? raw * 100000 : budget[2] ? raw * 1000 : raw;
  }

  for (const season of ["aman", "boro", "aus", "rabi", "kharif-1", "kharif-2"]) {
    if (text.includes(season)) patch.targetSeason = season[0]!.toUpperCase() + season.slice(1);
  }

  return patch;
}
