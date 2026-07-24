/**
 * Marketplace intelligence API (Tier-2): seeded supplier ranking + market
 * price history + sell/store/wait recommendation + mem0 memory + trace.
 *   POST /api/marketplace/intelligence
 * Contract mirrors frontend/src/api/marketplace.ts. Consumed by the Market tab.
 */
import { apiFetch } from "./client";
import type { MarketplaceIntelligenceResult } from "./types";

export interface MarketplaceIntelligenceRequest {
  itemName: string;
  quantity: number;
  unit?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  crop?: string;
  userId?: string;
  sessionId?: string;
}

export function getMarketplaceIntelligence(
  input: MarketplaceIntelligenceRequest,
): Promise<MarketplaceIntelligenceResult> {
  return apiFetch<MarketplaceIntelligenceResult>("/api/marketplace/intelligence", {
    method: "POST",
    body: input,
  });
}
