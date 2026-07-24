/**
 * Knowledge base search — mirrors the search path of frontend/src/api/kb.ts.
 * Queries the shared hub knowledge base (agronomy sources) and returns grounded
 * hits with citations. Update BOTH sides in one commit.
 */
import { apiFetch } from './client';

export interface KbHit {
  text: string;
  score: number;
  docKey?: string;
  title?: string;
  source?: string;
  sourceUrl?: string;
  imageUrl?: string;
  page?: string;
  citation: string;
  verificationStatus: 'verified' | 'cross_checked' | 'unverified';
}

export interface KbSearchResponse {
  tenantId: string;
  hits: KbHit[];
  citations: string[];
}

export function searchKnowledgeBase(params: { query: string; userId?: string; cropId?: string }): Promise<KbSearchResponse> {
  const qs = new URLSearchParams({ query: params.query, tenantId: 'hub' });
  if (params.cropId) qs.set('cropId', params.cropId);
  return apiFetch<KbSearchResponse>(`/api/kb/search?${qs.toString()}`, {
    headers: params.userId ? { 'x-user-id': params.userId } : {},
  });
}
