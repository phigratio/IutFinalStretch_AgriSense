/**
 * Vector (prose) KB over mem0 (navid/kb §5). Agronomy prose is namespaced per tenant + a shared
 * hub. Because mem0 v2's single filtered search is unreliable, retrieval runs TWO scoped searches
 * (hub + tenant) and merges in code with a tenant boost and docKey override, producing
 * source-cited hits. Storage-agnostic via a minimal Mem0Like client (injected in tests).
 */

import { mem0Client } from "../rag/mem0Client.js";
import { config } from "../config.js";
import { HUB } from "./tenancy.js";
import { getKbDocumentStore, type KbDocumentStore } from "./documentStore.js";

export interface Mem0Like {
  add(input: {
    messages: { role: "user" | "assistant" | "system"; content: string }[];
    userId: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
  search(input: {
    query: string;
    userId: string;
    agentId?: string;
    limit?: number;
    filters?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface KbChunkMeta {
  scope: "hub" | "tenant";
  tenantId?: string;
  docKey: string;
  title?: string;
  docType: string; // fertilizer | pest | disease | practice | advisory | variety
  cropId?: string;
  season?: string;
  source: string;
  sourceUrl?: string;
  /** Optional illustrative image (e.g. a Cloudinary URL) surfaced with the hit. */
  imageUrl?: string;
  page?: string;
  dataOrigin: string; // real | manual | mock
  verificationStatus: "verified" | "cross_checked" | "unverified";
  retrievedAt?: string;
}

export interface KbHit {
  text: string;
  score: number;
  docKey?: string;
  scope?: "hub" | "tenant";
  tenantId?: string;
  title?: string;
  source?: string;
  sourceUrl?: string;
  imageUrl?: string;
  docType?: string;
  page?: string;
  citation: string;
  verificationStatus: KbChunkMeta["verificationStatus"];
}

const TENANT_BOOST = 0.1;

function hubUserId(): string {
  return config.mem0KbUserId;
}
function tenantUserId(tenantId: string): string {
  return `tenant:${tenantId}`;
}

/** Ingest one prose chunk into the hub or a tenant namespace. */
export async function addChunk(
  text: string,
  meta: KbChunkMeta,
  client: Mem0Like = mem0Client,
  documents: KbDocumentStore = getKbDocumentStore(),
): Promise<unknown> {
  const userId = meta.scope === "hub" ? hubUserId() : tenantUserId(meta.tenantId ?? "");
  if (meta.scope === "tenant" && !meta.tenantId) throw new Error("tenant chunks require tenantId");
  const result = await client.add({
    messages: [{ role: "user", content: text }],
    userId,
    agentId: config.mem0KbAgentId,
    metadata: { ...meta },
  });
  const ids = extractMem0Ids(result);
  await documents.upsert({
    tenantId: meta.scope === "hub" ? HUB : meta.tenantId!,
    scope: meta.scope,
    docKey: meta.docKey,
    title: meta.title ?? meta.docKey,
    source: meta.source,
    sourceUrl: meta.sourceUrl,
    imageUrl: meta.imageUrl,
    page: meta.page,
    cropId: meta.cropId,
    mem0Ids: ids,
    dataOrigin: meta.dataOrigin,
    verificationStatus: meta.verificationStatus,
    retrievedAt: meta.retrievedAt,
  });
  return result;
}

function extractMem0Ids(result: unknown): string[] {
  const root = result as Record<string, unknown> | undefined;
  const candidates = Array.isArray(result) ? result :
    Array.isArray(root?.results) ? root.results :
    Array.isArray(root?.memories) ? root.memories : [result];
  return candidates.flatMap((item) => {
    const row = item as Record<string, unknown> | undefined;
    const id = row?.id ?? row?.memory_id;
    return typeof id === "string" ? [id] : [];
  });
}

/** Normalize a mem0 search response (shape varies) into raw hits. */
function toRawHits(raw: unknown): { text: string; score: number; metadata: KbChunkMeta }[] {
  const arr =
    Array.isArray(raw) ? raw
    : (raw as { results?: unknown[] })?.results ??
      (raw as { memories?: unknown[] })?.memories ??
      [];
  return (arr as Record<string, unknown>[]).map((h) => ({
    text: String(h.memory ?? h.text ?? h.content ?? ""),
    score: typeof h.score === "number" ? h.score : 0,
    metadata: (h.metadata ?? {}) as KbChunkMeta,
  }));
}

function citationOf(m: KbChunkMeta): string {
  const base = `[KB:${m.source}${m.page ? ` p.${m.page}` : ""}]`;
  return m.scope === "tenant" && m.tenantId ? `${base} (local: ${m.tenantId})` : base;
}

export interface SearchKbOptions {
  tenantId?: string;
  cropId?: string;
  limit?: number;
  /** Admin/debug search may include newly ingested unverified documents; farmer-facing search must leave this false. */
  includeUnverified?: boolean;
}

/**
 * Two-search-merge retrieval: hub + tenant, tenant-boosted, deduped/overridden by docKey.
 * Returns cited hits. Never throws on a mem0 error for one side — degrades to the other.
 */
export async function searchKB(
  query: string,
  opts: SearchKbOptions = {},
  client: Mem0Like = mem0Client,
): Promise<KbHit[]> {
  const limit = opts.limit ?? 5;
  const cropFilter = opts.cropId ? { cropId: opts.cropId } : {};

  const runSearch = async (userId: string, filters: Record<string, unknown>, boost: number) => {
    try {
      const raw = await client.search({ query, userId, agentId: config.mem0KbAgentId, limit, filters });
      return toRawHits(raw).map((h) => ({ ...h, score: h.score + boost }));
    } catch {
      return [];
    }
  };

  const hub = await runSearch(hubUserId(), { scope: "hub", ...cropFilter }, 0);
  const tenant =
    opts.tenantId && opts.tenantId !== HUB
      ? await runSearch(tenantUserId(opts.tenantId), { scope: "tenant", tenantId: opts.tenantId, ...cropFilter }, TENANT_BOOST)
      : [];

  // docKey override: a tenant chunk with the same docKey replaces the hub one.
  const tenantDocKeys = new Set(tenant.map((h) => h.metadata.docKey).filter(Boolean));
  const merged = [
    ...tenant,
    ...hub.filter((h) => !h.metadata.docKey || !tenantDocKeys.has(h.metadata.docKey)),
  ]
    .filter((h) => h.metadata.dataOrigin !== "mock")
    .filter((h) => opts.includeUnverified || h.metadata.verificationStatus === "verified" || h.metadata.verificationStatus === "cross_checked")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return merged.map((h) => ({
    // Strip any HTML-comment metadata header so callers see clean prose, even for
    // chunks ingested before chunkDoc learned to remove it.
    text: h.text.replace(/<!--[\s\S]*?-->/g, "").trim(),
    score: h.score,
    docKey: h.metadata.docKey,
    scope: h.metadata.scope,
    tenantId: h.metadata.tenantId,
    title: h.metadata.title,
    source: h.metadata.source,
    sourceUrl: h.metadata.sourceUrl,
    imageUrl: h.metadata.imageUrl,
    docType: h.metadata.docType,
    page: h.metadata.page,
    citation: citationOf(h.metadata),
    verificationStatus: h.metadata.verificationStatus,
  }));
}
