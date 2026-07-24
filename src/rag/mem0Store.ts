import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";

const EMBEDDING_DIMENSIONS = 1536;

export interface RagMemory {
  id: string;
  userId?: string;
  agentId?: string;
  runId?: string;
  role: string;
  content: string;
  metadata: Prisma.JsonValue;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RagMemorySearchResult extends RagMemory {
  similarity: number;
}

export interface CreateRagMemoryInput {
  userId?: string;
  agentId?: string;
  runId?: string;
  role?: string;
  content: string;
  metadata?: Prisma.InputJsonValue;
  tags?: string[];
  embedding: number[];
}

export interface SearchRagMemoriesInput {
  userId?: string;
  agentId?: string;
  runId?: string;
  embedding: number[];
  limit?: number;
  minSimilarity?: number;
}

interface RagMemoryRow {
  id: string;
  user_id: string | null;
  agent_id: string | null;
  run_id: string | null;
  role: string;
  content: string;
  metadata: Prisma.JsonValue;
  tags: string[];
  created_at: Date;
  updated_at: Date;
}

interface RagMemorySearchRow extends RagMemoryRow {
  similarity: number;
}

export class Mem0RagStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async initialize(): Promise<void> {
    await this.prisma.$connect();
  }

  async createMemory(input: CreateRagMemoryInput): Promise<RagMemory> {
    const id = randomUUID();
    const embedding = toVectorLiteral(input.embedding);
    const metadata = input.metadata ?? {};
    const tags = input.tags ?? [];

    const rows = await this.prisma.$queryRaw<RagMemoryRow[]>`
      INSERT INTO "rag_memories" (
        "id", "user_id", "agent_id", "run_id", "role", "content", "metadata", "tags", "embedding"
      )
      VALUES (
        ${id}::uuid,
        ${input.userId ?? null}::uuid,
        ${input.agentId ?? null},
        ${input.runId ?? null},
        ${input.role ?? "memory"},
        ${input.content},
        ${metadata},
        ${tags},
        ${embedding}::vector
      )
      RETURNING "id", "user_id", "agent_id", "run_id", "role", "content", "metadata", "tags", "created_at", "updated_at"
    `;

    return mapMemory(rows[0]!);
  }

  async searchMemories(input: SearchRagMemoriesInput): Promise<RagMemorySearchResult[]> {
    const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
    const minSimilarity = input.minSimilarity ?? 0;
    const embedding = toVectorLiteral(input.embedding);

    const rows = await this.prisma.$queryRaw<RagMemorySearchRow[]>`
      SELECT
        "id",
        "user_id",
        "agent_id",
        "run_id",
        "role",
        "content",
        "metadata",
        "tags",
        "created_at",
        "updated_at",
        1 - ("embedding" <=> ${embedding}::vector) AS "similarity"
      FROM "rag_memories"
      WHERE (${input.userId ?? null}::uuid IS NULL OR "user_id" = ${input.userId ?? null}::uuid)
        AND (${input.agentId ?? null}::text IS NULL OR "agent_id" = ${input.agentId ?? null})
        AND (${input.runId ?? null}::text IS NULL OR "run_id" = ${input.runId ?? null})
        AND 1 - ("embedding" <=> ${embedding}::vector) >= ${minSimilarity}
      ORDER BY "embedding" <=> ${embedding}::vector
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      ...mapMemory(row),
      similarity: row.similarity,
    }));
  }

  async deleteMemory(id: string): Promise<boolean> {
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM "rag_memories"
      WHERE "id" = ${id}::uuid
    `;

    return deleted > 0;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, got ${embedding.length}`);
  }

  if (!embedding.every(Number.isFinite)) {
    throw new Error("Embedding must contain only finite numbers");
  }

  return `[${embedding.join(",")}]`;
}

function mapMemory(row: RagMemoryRow): RagMemory {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    runId: row.run_id ?? undefined,
    role: row.role,
    content: row.content,
    metadata: row.metadata,
    tags: row.tags,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

let defaultMem0RagStore: Mem0RagStore | undefined;

export function getDefaultMem0RagStore(): Mem0RagStore {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for the Mem0 RAG store");
  }

  defaultMem0RagStore ??= new Mem0RagStore(config.databaseUrl);
  return defaultMem0RagStore;
}
