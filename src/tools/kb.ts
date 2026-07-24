/**
 * query_knowledge_base tool (T0-7). Thin wrapper over the tenant-aware vector KB so the agent can
 * ground prose advice in retrieved chunks with citations. Returns hits + a compact citation list.
 */

import { searchKB, type KbHit, type Mem0Like } from "../kb/vectorKb.js";

export interface QueryKbOptions {
  tenantId?: string;
  cropId?: string;
  limit?: number;
}

export interface KnowledgeResult {
  hits: KbHit[];
  citations: string[];
}

export async function queryKnowledgeBase(
  query: string,
  opts: QueryKbOptions = {},
  client?: Mem0Like,
): Promise<KnowledgeResult> {
  const hits = await searchKB(query, opts, client);
  const citations = [...new Set(hits.map((h) => h.citation))];
  return { hits, citations };
}
