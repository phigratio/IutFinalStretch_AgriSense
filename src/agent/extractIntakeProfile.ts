/**
 * OpenAI-backed intake extraction for T0-1. It returns only durable profile
 * facts; deterministic code merges and decides follow-up gaps.
 */
import { config } from "../config.js";
import { buildMultilingualQuery, detectInputLanguage, normalizeBanglaDigits } from "../language/localization.js";
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
      preferredLanguage: { type: ["string", "null"], enum: ["en", "bn", "banglish", null] },
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

    try {
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
            "Support English, Bangla script, and Banglish/Romanized Bangla farmer language.",
            "Set preferredLanguage to en, bn, or banglish from the user's latest message unless they explicitly choose another language.",
            "Do not infer missing soil, water, budget, season, or location.",
            "Use BDT for budget. If the user says 45k, output 45000.",
            "Normalize Bangla/Banglish farmer words when explicit: bele/bেলে/বেলে means sandy soil; doash/দোআঁশ means loam; etel/এঁটেল means clay; nodi/নদী means river; pukur/পুকুর means pond; brishti/বৃষ্টি means rainfed.",
            "Valid water examples: rainfed, tubewell, canal, pond, river, mixed.",
            "Valid season examples: Aman, Boro, Aus, Rabi, Kharif-1, Kharif-2, Monsoon.",
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
                    normalizedFarmerMessage: buildMultilingualQuery(message),
                    detectedLanguage: detectInputLanguage(message, currentProfile.preferredLanguage),
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
    } catch (error) {
      const fallback = heuristicExtract(message);
      fallback.confidence = Math.min(fallback.confidence ?? 0.45, 0.4);
      fallback.notes = [
        ...(fallback.notes ?? []),
        `OpenAI extraction fallback: ${(error as Error).message.slice(0, 160)}`,
      ];
      return fallback;
    }
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
  const digitNormalizedMessage = normalizeBanglaDigits(message);
  const text = digitNormalizedMessage.toLowerCase();
  const multilingual = buildMultilingualQuery(digitNormalizedMessage).toLowerCase();
  const normalized = multilingual
    .replace(/[，।]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  const patch: IntakeProfilePatch = {
    preferredLanguage: detectInputLanguage(message),
    confidence: 0.45,
    notes: ["heuristic fallback used"],
  };

  const location = extractLocation(digitNormalizedMessage, normalized);
  if (location) patch.locationText = location.trim();

  const acre = normalized.match(/(\d+(?:\.\d+)?)\s*(?:acre|acres|একর)/);
  const bigha = normalized.match(/(\d+(?:\.\d+)?)\s*(?:bigha|biga|বিঘা)/);
  const decimal = text.match(/(\d+(?:\.\d+)?)\s*(?:decimal|shotok|shotangsho|শতক)/);
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

  const soilAliases: Array<[string, string]> = [
    ["sandy loam", "sandy loam"],
    ["sandy-loam", "sandy loam"],
    ["bele doash", "sandy loam"],
    ["বেলে দোআঁশ", "sandy loam"],
    ["clay loam", "clay loam"],
    ["clay-loam", "clay loam"],
    ["sandy", "sandy"],
    ["bele", "sandy"],
    ["বেলে", "sandy"],
    ["loam", "loam"],
    ["doash", "loam"],
    ["দোআঁশ", "loam"],
    ["clay", "clay"],
    ["etel", "clay"],
    ["এঁটেল", "clay"],
    ["silt", "silt"],
  ];
  for (const [soil, canonical] of soilAliases) {
    if (normalized.includes(soil)) {
      patch.soilType = canonical;
      break;
    }
  }

  const hasRain = /\b(rainfed|rain|brishti|bristi|bristir|monsoon)\b|বৃষ্টি/.test(normalized);
  const hasRiver = /\b(river|nodi|nodir|nearby river)\b|নদী/.test(normalized);
  const hasTubewell = /\b(tubewell|tube well|deep tube|shallow tube)\b/.test(normalized);
  const hasCanal = /\b(canal|khal)\b|খাল/.test(normalized);
  const hasPond = /\b(pond|pukur)\b|পুকুর/.test(normalized);
  if ((hasRain && hasRiver) || (hasRain && (hasTubewell || hasCanal || hasPond))) {
    patch.waterAvailability = "mixed";
  } else if (hasRiver) {
    patch.waterAvailability = "river";
  } else if (hasRain) {
    patch.waterAvailability = "rainfed";
  } else if (hasTubewell) {
    patch.waterAvailability = "tubewell";
  } else if (hasCanal) {
    patch.waterAvailability = "canal";
  } else if (hasPond) {
    patch.waterAvailability = "pond";
  } else {
    for (const water of ["rainfed", "tubewell", "tube well", "canal", "pond", "mixed"]) {
      if (normalized.includes(water)) patch.waterAvailability = water.replace("tube well", "tubewell");
    }
  }

  const budget = normalized.match(/(?:budget|৳|tk|taka|bdt|cost|khoroch|খরচ|টাকা|বাজেট)\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*(k|thousand|hazar|হাজার|লাখ|lakh|lac)?/)
    ?? normalized.match(/(\d+(?:\.\d+)?)\s*(k|thousand|hazar|হাজার|lakh|lac|লাখ)(?:\s|,|$)/)
    ?? normalized.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lac)?\s*(?:tk|taka|bdt)/)
    ?? digitNormalizedMessage.match(/(\d+(?:\.\d+)?)\s*(হাজার|লাখ)/);
  if (budget) {
    const raw = Number(budget[1]);
    const unit = budget[2];
    patch.budgetBdt = unit === "lakh" || unit === "lac" || unit === "লাখ" ? raw * 100000 : unit ? raw * 1000 : raw;
  }

  const seasonAliases: Array<[string, string]> = [
    ["aman", "Aman"],
    ["boro", "Boro"],
    ["aus", "Aus"],
    ["rabi", "Rabi"],
    ["kharif-1", "Kharif-1"],
    ["kharif 1", "Kharif-1"],
    ["kharif-2", "Kharif-2"],
    ["kharif 2", "Kharif-2"],
    ["monsoon", "Monsoon"],
    ["borsha", "Monsoon"],
    ["বর্ষা", "Monsoon"],
    ["আমন", "Aman"],
    ["বোরো", "Boro"],
    ["আউশ", "Aus"],
    ["রবি", "Rabi"],
    ["bristi season", "Monsoon"],
  ];
  for (const [season, canonical] of seasonAliases) {
    if (normalized.includes(season)) {
      patch.targetSeason = canonical;
      break;
    }
  }

  return patch;
}

function extractLocation(message: string, normalized: string): string | undefined {
  const titledLocation = message.match(/\b(?:in|at|from|near|e|te)\s+([A-Z][A-Za-z -]{2,})/)?.[1];
  if (titledLocation) return titledLocation;

  const lowercaseLocation = normalized.match(/\b(?:in|at|from|near|e|te)\s+([a-z][a-z -]{2,})(?=,|\s+(?:soil|jomi|land|farm|water|budget|season|target)\b|$)/)?.[1];
  if (lowercaseLocation) return toTitleCase(cleanLocation(lowercaseLocation));

  const knownDistricts = [
    "dhaka",
    "gazipur",
    "bogura",
    "rangpur",
    "dinajpur",
    "rajshahi",
    "jashore",
    "khulna",
    "barisal",
    "sylhet",
    "mymensingh",
    "cumilla",
    "chattogram",
    "faridpur",
    "tangail",
  ];
  const district = knownDistricts.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(normalized));
  if (district) return toTitleCase(district);

  const banglaDistricts: Array<[RegExp, string]> = [
    [/গাজীপুর/, "Gazipur"],
    [/ঢাকা/, "Dhaka"],
    [/বগুড়া|বগুড়া/, "Bogura"],
    [/রংপুর/, "Rangpur"],
    [/দিনাজপুর/, "Dinajpur"],
    [/রাজশাহী/, "Rajshahi"],
    [/যশোর/, "Jashore"],
    [/খুলনা/, "Khulna"],
    [/বরিশাল/, "Barisal"],
    [/সিলেট/, "Sylhet"],
    [/ময়মনসিংহ|ময়মনসিংহ/, "Mymensingh"],
    [/কুমিল্লা/, "Cumilla"],
    [/চট্টগ্রাম/, "Chattogram"],
    [/ফরিদপুর/, "Faridpur"],
    [/টাঙ্গাইল/, "Tangail"],
  ];
  return banglaDistricts.find(([pattern]) => pattern.test(message))?.[1];
}

function cleanLocation(location: string): string {
  return location
    .replace(/\b(?:soil|jomi|land|farm|water|budget|season|target)\b.*$/i, "")
    .trim();
}

function toTitleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
