import { config } from "../config.js";
import { buildMultilingualQuery, type SupportedLanguage } from "../language/localization.js";
import { mem0Client, type Mem0Client } from "../rag/mem0Client.js";
import { type IntakeProfile } from "../agent/intakeSchema.js";
import { type RetrievedEvidence, type WeatherForecast } from "./types.js";

export interface KnowledgeRetrievalInput {
  message: string;
  profile: IntakeProfile;
  weather: WeatherForecast;
  language: SupportedLanguage;
  userId?: string;
  tenantId?: string;
}

export interface KnowledgeRetriever {
  retrieve(input: KnowledgeRetrievalInput): Promise<RetrievedEvidence[]>;
}

const SEEDED_EVIDENCE: RetrievedEvidence[] = [
  {
    id: "seeded:rice-baseline",
    source: "seeded-baseline",
    title: "Rice Aman/Boro baseline",
    crop: "rice",
    citation: "seeded:rice-baseline",
    content: "Rice fits Aman, Boro, Aus, and Kharif-2 seasons; it tolerates clay to loam soils and has high water demand.",
  },
  {
    id: "seeded:maize-baseline",
    source: "seeded-baseline",
    title: "Maize Rabi/Kharif baseline",
    crop: "maize",
    citation: "seeded:maize-baseline",
    content: "Maize fits Rabi and Kharif-1 seasons, prefers loam or sandy loam soil, and has medium water demand.",
  },
  {
    id: "seeded:potato-baseline",
    source: "seeded-baseline",
    title: "Potato Rabi baseline",
    crop: "potato",
    citation: "seeded:potato-baseline",
    content: "Potato fits Rabi season, prefers sandy loam or loam soil, and is sensitive to excessive heat and waterlogging.",
  },
  {
    id: "seeded:mustard-baseline",
    source: "seeded-baseline",
    title: "Mustard Rabi baseline",
    crop: "mustard",
    citation: "seeded:mustard-baseline",
    content: "Mustard fits Rabi season, needs relatively low water, and is useful when budget or irrigation is constrained.",
  },
  {
    id: "seeded:tomato-baseline",
    source: "seeded-baseline",
    title: "Tomato Rabi/Kharif baseline",
    crop: "tomato",
    citation: "seeded:tomato-baseline",
    content: "Tomato fits Rabi and Kharif-1 seasons, prefers loam or sandy loam soil, and needs regular water management.",
  },
];

export class SeededKnowledgeRetriever implements KnowledgeRetriever {
  async retrieve(input: KnowledgeRetrievalInput): Promise<RetrievedEvidence[]> {
    const query = buildMultilingualQuery([
      input.message,
      input.profile.currentCrop,
      input.profile.targetSeason,
      input.profile.soilType,
      input.profile.waterAvailability,
      input.profile.locationText,
    ].filter(Boolean).join(" "));
    const normalized = query.toLowerCase();

    const cropMatches = SEEDED_EVIDENCE.filter((item) => {
      return item.crop ? normalized.includes(item.crop) || normalized.includes(item.title.toLowerCase()) : false;
    });

    const seasonMatches = SEEDED_EVIDENCE.filter((item) => {
      const content = item.content.toLowerCase();
      return Boolean(input.profile.targetSeason && content.includes(input.profile.targetSeason.toLowerCase()));
    });

    return uniqueEvidence([...cropMatches, ...seasonMatches, ...SEEDED_EVIDENCE]).slice(0, 5);
  }
}

export class Mem0KnowledgeRetriever implements KnowledgeRetriever {
  constructor(
    private readonly fallback: KnowledgeRetriever = new SeededKnowledgeRetriever(),
    private readonly client: Mem0Client = mem0Client,
  ) {}

  async retrieve(input: KnowledgeRetrievalInput): Promise<RetrievedEvidence[]> {
    const seeded = await this.fallback.retrieve(input);
    if (!config.mem0PersistenceEnabled) return seeded;

    const userId = input.userId ?? input.tenantId ?? input.profile.farmerId ?? input.profile.sessionId;
    if (!userId) return seeded;

    try {
      const raw = await this.client.search({
        userId,
        agentId: "agrisense-intake",
        runId: input.profile.sessionId,
        language: input.language,
        limit: 5,
        query: [
          input.message,
          input.profile.locationText,
          input.profile.soilType,
          input.profile.waterAvailability,
          input.profile.targetSeason,
          input.profile.currentCrop,
        ].filter(Boolean).join(" "),
      });
      return uniqueEvidence([
        ...mapMem0Results(raw),
        ...seeded,
      ]).slice(0, 8);
    } catch (error) {
      return [
        {
          id: "mem0:error",
          source: "mem0",
          title: "mem0 retrieval unavailable",
          content: (error as Error).message,
          metadata: { status: "error" },
        },
        ...seeded,
      ];
    }
  }
}

function mapMem0Results(raw: unknown): RetrievedEvidence[] {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { results?: unknown[] })?.results)
      ? (raw as { results: unknown[] }).results
      : Array.isArray((raw as { memories?: unknown[] })?.memories)
        ? (raw as { memories: unknown[] }).memories
        : [];

  return list.map((item, index) => {
    const record = item as Record<string, unknown>;
    const metadata = typeof record.metadata === "object" && record.metadata !== null
      ? record.metadata as Record<string, unknown>
      : {};
    return {
      id: String(record.id ?? metadata.id ?? `mem0:${index}`),
      source: "mem0",
      title: String(metadata.title ?? metadata.source ?? "mem0 memory"),
      content: String(record.memory ?? record.content ?? record.text ?? JSON.stringify(record)),
      citation: typeof metadata.citation === "string" ? metadata.citation : undefined,
      crop: typeof metadata.crop === "string" ? metadata.crop : undefined,
      metadata,
    };
  });
}

function uniqueEvidence(items: RetrievedEvidence[]): RetrievedEvidence[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export const defaultKnowledgeRetriever = new Mem0KnowledgeRetriever();
