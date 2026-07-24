import { apiFetch } from "./client.js";
import { type TraceEvent } from "./agrisense.js";

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

export interface SupplierOffer {
  supplierId: string;
  supplierName: string;
  district: string;
  itemName: string;
  category: string;
  unit: string;
  unitPriceBdt: number;
  quantityAvailable: number;
  requestedQuantity: number;
  totalPriceBdt: number;
  deliveryDays: number;
  distanceKm: number;
  rating: number;
  score: number;
  rankReason: string;
}

export interface MarketPricePoint {
  crop: string;
  marketName: string;
  district: string;
  unit: string;
  observedAt: string;
  wholesalePriceBdt: number;
  farmgatePriceBdt: number;
}

export interface MarketplaceIntelligenceResult {
  id?: string;
  agentMessage: string;
  needs: {
    itemName: string;
    quantity: number;
    unit: string;
    district?: string;
    latitude?: number;
    longitude?: number;
  };
  supplierOffers: SupplierOffer[];
  priceIntelligence: {
    crop: string;
    current?: MarketPricePoint;
    history: MarketPricePoint[];
    trendPct: number;
    recommendation: {
      action: "sell_now" | "store" | "wait";
      confidence: number;
      reasoning: string;
    };
  };
  memory: {
    status: "used" | "unavailable";
    retrieved: unknown[];
    error?: string;
  };
  trace: TraceEvent[];
  seeded: true;
}

export interface MarketplaceRunRecord extends MarketplaceIntelligenceResult {
  id: string;
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  crop: string;
  createdAt: string;
}

export function getMarketplaceIntelligence(input: MarketplaceIntelligenceRequest): Promise<MarketplaceIntelligenceResult> {
  return apiFetch<MarketplaceIntelligenceResult>("/api/marketplace/intelligence", {
    method: "POST",
    body: input,
  });
}

export function listMarketplaceRuns(input: {
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
  limit?: number;
} = {}): Promise<MarketplaceRunRecord[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return apiFetch<MarketplaceRunRecord[]>(`/api/marketplace/runs${query ? `?${query}` : ""}`);
}

export function getMarketplaceRun(id: string): Promise<MarketplaceRunRecord> {
  return apiFetch<MarketplaceRunRecord>(`/api/marketplace/runs/${id}`);
}
