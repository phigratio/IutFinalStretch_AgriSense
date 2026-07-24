import { randomUUID } from "node:crypto";
import { mem0Client, type Mem0Client } from "../rag/mem0Client.js";
import { type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { contextHydrator } from "../context/contextService.js";
import { getDefaultMarketplaceStore, type MarketplaceStore } from "./marketplaceStore.js";
import {
  type MarketPriceIntelligence,
  type MarketRecommendationAction,
  type MarketplaceIntelligenceRequest,
  type MarketplaceIntelligenceResult,
  type MarketplaceNeed,
  type MarketplaceRunRecord,
} from "./types.js";

const MARKETPLACE_AGENT_ID = "marketplace-intelligence";

export class MarketplaceService {
  constructor(
    private readonly store: MarketplaceStore = getDefaultMarketplaceStore(),
    private readonly memory: Mem0Client = mem0Client,
  ) {}

  async getIntelligence(input: MarketplaceIntelligenceRequest): Promise<MarketplaceIntelligenceResult> {
    validateRequest(input);
    const trace: IntakeTraceEvent[] = [];
    const userId = input.userId ?? "demo-farmer";
    const runId = input.sessionId ?? randomUUID();
    const hydratedContext = await contextHydrator.hydrate({
      message: `${input.itemName} ${input.crop ?? ""} marketplace supplier and price intelligence`,
      userId: input.userId,
      tenantId: input.tenantId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      cropId: input.crop,
      limit: 8,
    });
    trace.push(...hydratedContext.trace);
    const crop = normalizeCrop(input.crop ?? hydratedContext.profile?.currentCrop ?? inferCrop(input.itemName));
    const needs: MarketplaceNeed = {
      itemName: input.itemName.trim(),
      quantity: input.quantity,
      unit: input.unit?.trim() || "kg",
      district: input.district?.trim() || districtFromProfile(hydratedContext.profile?.locationText) || "Gazipur",
      latitude: input.latitude ?? hydratedContext.profile?.latitude,
      longitude: input.longitude ?? hydratedContext.profile?.longitude,
    };

    const seedStarted = Date.now();
    await this.store.ensureSeeded();
    trace.push({
      kind: "tool",
      toolName: "marketplace.seed.ensure",
      parameters: { seededCatalog: true, seededMarketPrices: true },
      rawResponse: { status: "ready" },
      status: "success",
      latencyMs: Date.now() - seedStarted,
    });

    const supplierStarted = Date.now();
    const supplierOffers = await this.store.listSupplierOffers(needs);
    trace.push({
      kind: "tool",
      toolName: "marketplace.suppliers.rank",
      parameters: { ...needs },
      rawResponse: supplierOffers,
      status: "success",
      latencyMs: Date.now() - supplierStarted,
    });

    const priceStarted = Date.now();
    const history = await this.store.listMarketPrices(crop, needs.district);
    const priceIntelligence = buildPriceIntelligence(crop, history);
    trace.push({
      kind: "tool",
      toolName: "market.price.intelligence",
      parameters: { crop, district: needs.district },
      rawResponse: priceIntelligence,
      status: "success",
      latencyMs: Date.now() - priceStarted,
    });

    const memoryStarted = Date.now();
    let memoryResult: MarketplaceIntelligenceResult["memory"];
    try {
      await this.memory.add({
        userId,
        agentId: MARKETPLACE_AGENT_ID,
        runId,
        infer: false,
        messages: [
          {
            role: "assistant",
            content: `Marketplace intelligence for ${needs.quantity} ${needs.unit} ${needs.itemName} in ${needs.district}: ${supplierOffers[0]?.supplierName ?? "no supplier"} ranked first. ${priceIntelligence.crop} recommendation is ${priceIntelligence.recommendation.action}.`,
          },
        ],
        metadata: {
          feature: "marketplace_intelligence",
          seeded: true,
          itemName: needs.itemName,
          crop,
          district: needs.district,
        },
      });
      const retrieved = await this.memory.search({
        userId,
        agentId: MARKETPLACE_AGENT_ID,
        runId,
        query: `${needs.itemName} ${crop} ${needs.district} supplier price recommendation`,
        limit: 5,
        filters: { feature: "marketplace_intelligence", seeded: true },
      });
      memoryResult = {
        status: "used",
        retrieved: normalizeMemoryResults(retrieved),
      };
      trace.push({
        kind: "tool",
        toolName: "mem0.marketplace.memory",
        parameters: { userId, agentId: MARKETPLACE_AGENT_ID, runId, itemName: needs.itemName, crop },
        rawResponse: retrieved,
        status: "success",
        latencyMs: Date.now() - memoryStarted,
      });
    } catch (error) {
      memoryResult = {
        status: "unavailable",
        retrieved: [],
        error: (error as Error).message,
      };
      trace.push({
        kind: "error",
        toolName: "mem0.marketplace.memory",
        parameters: { userId, agentId: MARKETPLACE_AGENT_ID, runId, itemName: needs.itemName, crop },
        rawResponse: { fallback: "seeded-db-only" },
        status: "error",
        errorMessage: (error as Error).message,
        latencyMs: Date.now() - memoryStarted,
      });
    }

    const topOffer = supplierOffers[0];
    const result: MarketplaceIntelligenceResult = {
      agentMessage: buildAgentMessage(topOffer, priceIntelligence),
      needs,
      supplierOffers,
      priceIntelligence,
      memory: memoryResult,
      context: hydratedContext,
      trace,
      seeded: true,
    };
    const saved = await this.store.saveRun({
      result,
      userId: input.userId,
      tenantId: input.tenantId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      crop,
    });
    return { ...result, id: saved.id };
  }

  async listRuns(input: { userId?: string; tenantId?: string; farmerId?: string; farmId?: string; sessionId?: string; limit?: number }): Promise<MarketplaceRunRecord[]> {
    await this.store.ensureSeeded();
    return this.store.listRuns(input);
  }

  async getRun(id: string): Promise<MarketplaceRunRecord | undefined> {
    return this.store.getRun(id);
  }
}

export const marketplaceService = new MarketplaceService();

function buildPriceIntelligence(crop: string, history: MarketPriceIntelligence["history"]): MarketPriceIntelligence {
  const current = history.at(-1);
  const previous = history.length >= 2 ? history[history.length - 2] : undefined;
  const oldest = history[0];
  const trendPct = oldest && current
    ? round(((current.farmgatePriceBdt - oldest.farmgatePriceBdt) / oldest.farmgatePriceBdt) * 100, 1)
    : 0;
  const weeklyPct = previous && current
    ? round(((current.farmgatePriceBdt - previous.farmgatePriceBdt) / previous.farmgatePriceBdt) * 100, 1)
    : 0;

  const action: MarketRecommendationAction =
    trendPct >= 8 || weeklyPct >= 4 ? "sell_now" : trendPct <= -6 || weeklyPct <= -3 ? "store" : "wait";
  const reasoning = current
    ? recommendationReason(action, trendPct, weeklyPct, current)
    : `No local price history exists for ${crop}; wait until a local market quote is available.`;

  return {
    crop,
    current,
    history,
    trendPct,
    recommendation: {
      action,
      confidence: history.length >= 4 ? 0.78 : 0.55,
      reasoning,
    },
  };
}

function recommendationReason(
  action: MarketRecommendationAction,
  trendPct: number,
  weeklyPct: number,
  current: NonNullable<MarketPriceIntelligence["current"]>,
): string {
  if (action === "sell_now") {
    return `Farmgate price is ${formatBdt(current.farmgatePriceBdt)}/${current.unit}, up ${trendPct}% across the available history and ${weeklyPct}% week over week. Selling now captures the strong move before reversal risk.`;
  }
  if (action === "store") {
    return `Farmgate price is ${formatBdt(current.farmgatePriceBdt)}/${current.unit}, down ${trendPct}% across the available history and ${weeklyPct}% week over week. Store if quality and cash flow allow.`;
  }
  return `Farmgate price is ${formatBdt(current.farmgatePriceBdt)}/${current.unit}; movement is modest at ${trendPct}% across the available history and ${weeklyPct}% week over week. Wait for a clearer move or local buyer quote.`;
}

function buildAgentMessage(
  topOffer: MarketplaceIntelligenceResult["supplierOffers"][number] | undefined,
  price: MarketPriceIntelligence,
): string {
  const supplierLine = topOffer
    ? `Best supplier is ${topOffer.supplierName}: ${formatBdt(topOffer.unitPriceBdt)}/${topOffer.unit}, ${topOffer.deliveryDays} day delivery, ${topOffer.distanceKm.toFixed(0)} km away, rating ${topOffer.rating.toFixed(1)}/5.`
    : "No supplier has enough matching stock for this request.";
  const actionLabel = price.recommendation.action.replace("_", " ");
  return `${supplierLine} Market recommendation for ${price.crop}: ${actionLabel}. ${price.recommendation.reasoning}`;
}

function validateRequest(input: MarketplaceIntelligenceRequest): void {
  if (!input.itemName?.trim()) {
    throw new Error("itemName is required");
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("quantity must be a positive number");
  }
}

function inferCrop(itemName: string): string {
  const normalized = itemName.toLowerCase();
  if (normalized.includes("maize")) return "maize";
  if (normalized.includes("mustard")) return "mustard";
  return "rice";
}

function normalizeCrop(crop: string): string {
  const normalized = crop.trim().toLowerCase();
  if (normalized.includes("boro") || normalized.includes("aman") || normalized.includes("dhan")) return "rice";
  return normalized;
}

function districtFromProfile(locationText: string | undefined): string | undefined {
  return locationText?.split(",")[0]?.trim() || undefined;
}

function normalizeMemoryResults(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && "results" in value && Array.isArray((value as { results: unknown }).results)) {
    return (value as { results: unknown[] }).results;
  }
  if (value && typeof value === "object" && "memories" in value && Array.isArray((value as { memories: unknown }).memories)) {
    return (value as { memories: unknown[] }).memories;
  }
  return value === undefined ? [] : [value];
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatBdt(value: number): string {
  return `BDT ${value.toFixed(value % 1 === 0 ? 0 : 1)}`;
}
