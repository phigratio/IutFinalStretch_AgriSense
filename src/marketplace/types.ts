import { type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { type ContextBundle } from "../context/contextService.js";

export interface MarketplaceNeed {
  itemName: string;
  quantity: number;
  unit: string;
  district?: string;
  latitude?: number;
  longitude?: number;
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

export type MarketRecommendationAction = "sell_now" | "store" | "wait";

export interface MarketPriceIntelligence {
  crop: string;
  current?: MarketPricePoint;
  history: MarketPricePoint[];
  trendPct: number;
  recommendation: {
    action: MarketRecommendationAction;
    confidence: number;
    reasoning: string;
  };
}

export interface MarketplaceIntelligenceRequest {
  itemName: string;
  quantity: number;
  unit?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  crop?: string;
  userId?: string;
  tenantId?: string;
  farmerId?: string;
  farmId?: string;
  sessionId?: string;
}

export interface MarketplaceIntelligenceResult {
  id?: string;
  agentMessage: string;
  needs: MarketplaceNeed;
  supplierOffers: SupplierOffer[];
  priceIntelligence: MarketPriceIntelligence;
  memory: {
    status: "used" | "unavailable";
    retrieved: unknown[];
    error?: string;
  };
  context?: ContextBundle;
  trace: IntakeTraceEvent[];
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
