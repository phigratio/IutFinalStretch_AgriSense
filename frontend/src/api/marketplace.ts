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

export function getMarketplaceIntelligence(input: MarketplaceIntelligenceRequest): Promise<MarketplaceIntelligenceResult> {
  return apiFetch<MarketplaceIntelligenceResult>("/api/marketplace/intelligence", {
    method: "POST",
    body: input,
  });
}
