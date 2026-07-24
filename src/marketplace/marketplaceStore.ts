import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { marketPriceSeeds, supplierSeeds } from "./seedData.js";
import { type MarketplaceIntelligenceResult, type MarketplaceRunRecord, type MarketPricePoint, type SupplierOffer } from "./types.js";

export interface SupplierSearchInput {
  itemName: string;
  quantity: number;
  unit: string;
  district?: string;
  latitude?: number;
  longitude?: number;
}

export interface MarketplaceStore {
  ensureSeeded(): Promise<void>;
  listSupplierOffers(input: SupplierSearchInput): Promise<SupplierOffer[]>;
  listMarketPrices(crop: string, district?: string): Promise<MarketPricePoint[]>;
  saveRun(input: {
    result: MarketplaceIntelligenceResult;
    userId?: string;
    tenantId?: string;
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    crop: string;
  }): Promise<MarketplaceRunRecord>;
  listRuns(input: { userId?: string; tenantId?: string; farmerId?: string; farmId?: string; sessionId?: string; limit?: number }): Promise<MarketplaceRunRecord[]>;
  getRun(id: string): Promise<MarketplaceRunRecord | undefined>;
  close?(): Promise<void>;
}

export class InMemoryMarketplaceStore implements MarketplaceStore {
  readonly runs: MarketplaceRunRecord[] = [];

  async ensureSeeded(): Promise<void> {
    return undefined;
  }

  async listSupplierOffers(input: SupplierSearchInput): Promise<SupplierOffer[]> {
    const normalizedNeed = normalizeText(input.itemName);
    const offers = supplierSeeds.flatMap((supplier) =>
      supplier.items
        .filter((item) => matchesNeed(normalizedNeed, item.itemName, item.category))
        .map((item) => {
          const distanceKm = estimateDistanceKm(input, supplier);
          const totalPriceBdt = roundMoney(input.quantity * item.priceBdt);
          return rankOffer({
            supplierId: stableSeedId(supplier.name),
            supplierName: supplier.name,
            district: supplier.district,
            itemName: item.itemName,
            category: item.category,
            unit: item.unit,
            unitPriceBdt: item.priceBdt,
            quantityAvailable: item.stockQuantity,
            requestedQuantity: input.quantity,
            totalPriceBdt,
            deliveryDays: supplier.deliveryDays,
            distanceKm,
            rating: supplier.rating,
            score: 0,
            rankReason: "",
          });
        }),
    );
    return sortOffers(offers);
  }

  async listMarketPrices(crop: string, district?: string): Promise<MarketPricePoint[]> {
    const normalizedCrop = normalizeText(crop);
    const normalizedDistrict = district ? normalizeText(district) : undefined;
    const cropMatches = marketPriceSeeds
      .filter((price) => normalizeText(price.crop) === normalizedCrop)
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const districtMatches = cropMatches.filter((price) => !normalizedDistrict || normalizeText(price.district) === normalizedDistrict || normalizeText(price.marketName).includes(normalizedDistrict));
    return districtMatches.length > 0 ? districtMatches : cropMatches;
  }

  async saveRun(input: {
    result: MarketplaceIntelligenceResult;
    userId?: string;
    tenantId?: string;
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    crop: string;
  }): Promise<MarketplaceRunRecord> {
    const id = randomUUID();
    const record: MarketplaceRunRecord = {
      ...input.result,
      id,
      userId: input.userId,
      tenantId: input.tenantId,
      farmerId: input.farmerId,
      farmId: input.farmId,
      sessionId: input.sessionId,
      crop: input.crop,
      createdAt: new Date().toISOString(),
    };
    this.runs.unshift(record);
    return record;
  }

  async listRuns(input: { userId?: string; tenantId?: string; farmerId?: string; farmId?: string; sessionId?: string; limit?: number }): Promise<MarketplaceRunRecord[]> {
    const limit = normalizeLimit(input.limit, 20);
    return this.runs
      .filter((row) => !input.userId || row.userId === input.userId)
      .filter((row) => !input.tenantId || row.tenantId === input.tenantId)
      .filter((row) => !input.farmerId || row.farmerId === input.farmerId)
      .filter((row) => !input.farmId || row.farmId === input.farmId)
      .filter((row) => !input.sessionId || row.sessionId === input.sessionId)
      .slice(0, limit);
  }

  async getRun(id: string): Promise<MarketplaceRunRecord | undefined> {
    return this.runs.find((run) => run.id === id);
  }
}

export class PostgresMarketplaceStore implements MarketplaceStore {
  private prisma: PrismaClient;
  private seeded = false;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async ensureSeeded(): Promise<void> {
    if (this.seeded) return;

    for (const supplier of supplierSeeds) {
      const supplierId = randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO "marketplace_suppliers" (
          "id", "name", "district", "latitude", "longitude", "rating", "delivery_days", "seeded", "created_at", "updated_at"
        )
        VALUES (
          ${supplierId}::uuid,
          ${supplier.name},
          ${supplier.district},
          ${supplier.latitude},
          ${supplier.longitude},
          ${supplier.rating},
          ${supplier.deliveryDays},
          true,
          now(),
          now()
        )
        ON CONFLICT ("name", "district") DO UPDATE SET
          "latitude" = EXCLUDED."latitude",
          "longitude" = EXCLUDED."longitude",
          "rating" = EXCLUDED."rating",
          "delivery_days" = EXCLUDED."delivery_days",
          "seeded" = true,
          "updated_at" = now()
      `;

      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "marketplace_suppliers"
        WHERE "name" = ${supplier.name} AND "district" = ${supplier.district}
        LIMIT 1
      `;
      const savedSupplierId = rows[0]?.id;
      if (!savedSupplierId) continue;

      for (const item of supplier.items) {
        await this.prisma.$executeRaw`
          INSERT INTO "marketplace_supplier_items" (
            "id", "supplier_id", "item_name", "category", "unit", "price_bdt", "stock_quantity", "seeded", "created_at", "updated_at"
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${savedSupplierId}::uuid,
            ${item.itemName},
            ${item.category},
            ${item.unit},
            ${item.priceBdt},
            ${item.stockQuantity},
            true,
            now(),
            now()
          )
          ON CONFLICT ("supplier_id", "item_name", "unit") DO UPDATE SET
            "category" = EXCLUDED."category",
            "price_bdt" = EXCLUDED."price_bdt",
            "stock_quantity" = EXCLUDED."stock_quantity",
            "seeded" = true,
            "updated_at" = now()
        `;
      }
    }

    for (const price of marketPriceSeeds) {
      await this.prisma.$executeRaw`
        INSERT INTO "market_prices" (
          "id", "crop", "market_name", "district", "unit", "observed_at",
          "wholesale_price_bdt", "farmgate_price_bdt", "seeded"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${price.crop},
          ${price.marketName},
          ${price.district},
          ${price.unit},
          ${price.observedAt}::date,
          ${price.wholesalePriceBdt},
          ${price.farmgatePriceBdt},
          true
        )
        ON CONFLICT ("crop", "market_name", "observed_at") DO UPDATE SET
          "district" = EXCLUDED."district",
          "unit" = EXCLUDED."unit",
          "wholesale_price_bdt" = EXCLUDED."wholesale_price_bdt",
          "farmgate_price_bdt" = EXCLUDED."farmgate_price_bdt",
          "seeded" = true
      `;
    }

    this.seeded = true;
  }

  async listSupplierOffers(input: SupplierSearchInput): Promise<SupplierOffer[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      supplierId: string;
      supplierName: string;
      district: string;
      latitude: number | null;
      longitude: number | null;
      itemName: string;
      category: string;
      unit: string;
      unitPriceBdt: number;
      quantityAvailable: number;
      deliveryDays: number;
      rating: number;
    }>>`
      SELECT
        s."id"::text AS "supplierId",
        s."name" AS "supplierName",
        s."district",
        s."latitude"::float8 AS "latitude",
        s."longitude"::float8 AS "longitude",
        i."item_name" AS "itemName",
        i."category",
        i."unit",
        i."price_bdt"::float8 AS "unitPriceBdt",
        i."stock_quantity"::float8 AS "quantityAvailable",
        s."delivery_days" AS "deliveryDays",
        s."rating"::float8 AS "rating"
      FROM "marketplace_supplier_items" i
      JOIN "marketplace_suppliers" s ON s."id" = i."supplier_id"
      WHERE
        i."stock_quantity" >= ${input.quantity}
        AND (
          lower(i."item_name") LIKE ${`%${normalizeText(input.itemName)}%`}
          OR lower(i."category") LIKE ${`%${normalizeText(input.itemName)}%`}
          OR lower(${input.itemName}) LIKE '%' || lower(i."item_name") || '%'
        )
      ORDER BY i."price_bdt" ASC
    `;

    const offers = rows.map((row) => {
      const distanceKm = estimateDistanceKm(input, {
        district: row.district,
        latitude: row.latitude ?? 23.685,
        longitude: row.longitude ?? 90.3563,
      });
      return rankOffer({
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        district: row.district,
        itemName: row.itemName,
        category: row.category,
        unit: row.unit,
        unitPriceBdt: Number(row.unitPriceBdt),
        quantityAvailable: Number(row.quantityAvailable),
        requestedQuantity: input.quantity,
        totalPriceBdt: roundMoney(input.quantity * Number(row.unitPriceBdt)),
        deliveryDays: row.deliveryDays,
        distanceKm,
        rating: Number(row.rating),
        score: 0,
        rankReason: "",
      });
    });

    return sortOffers(offers);
  }

  async listMarketPrices(crop: string, district?: string): Promise<MarketPricePoint[]> {
    const rows = await this.queryMarketPrices(crop, district);
    if (rows.length > 0 || !district) return rows;
    return this.queryMarketPrices(crop);
  }

  async saveRun(input: {
    result: MarketplaceIntelligenceResult;
    userId?: string;
    tenantId?: string;
    farmerId?: string;
    farmId?: string;
    sessionId?: string;
    crop: string;
  }): Promise<MarketplaceRunRecord> {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<MarketplaceRunRow[]>`
      INSERT INTO "marketplace_intelligence_runs" (
        "id", "user_id", "tenant_id", "farmer_id", "farm_id", "session_id",
        "item_name", "quantity", "unit", "district", "crop", "result"
      )
      VALUES (
        ${id}::uuid,
        ${input.userId ?? null}::uuid,
        ${input.tenantId ?? null}::uuid,
        ${input.farmerId ?? null}::uuid,
        ${input.farmId ?? null}::uuid,
        ${input.sessionId ?? null}::uuid,
        ${input.result.needs.itemName},
        ${input.result.needs.quantity},
        ${input.result.needs.unit},
        ${input.result.needs.district ?? null},
        ${input.crop},
        ${JSON.stringify({ ...input.result, id })}::jsonb
      )
      RETURNING
        "id", "user_id", "tenant_id", "farmer_id", "farm_id", "session_id",
        "crop", "result", "created_at"
    `;
    return mapRun(rows[0]!);
  }

  async listRuns(input: { userId?: string; tenantId?: string; farmerId?: string; farmId?: string; sessionId?: string; limit?: number }): Promise<MarketplaceRunRecord[]> {
    const limit = normalizeLimit(input.limit, 20);
    const rows = await this.prisma.$queryRaw<MarketplaceRunRow[]>`
      SELECT
        "id", "user_id", "tenant_id", "farmer_id", "farm_id", "session_id",
        "crop", "result", "created_at"
      FROM "marketplace_intelligence_runs"
      WHERE (${input.userId ?? null}::uuid IS NULL OR "user_id" = ${input.userId ?? null}::uuid)
        AND (${input.tenantId ?? null}::uuid IS NULL OR "tenant_id" = ${input.tenantId ?? null}::uuid)
        AND (${input.farmerId ?? null}::uuid IS NULL OR "farmer_id" = ${input.farmerId ?? null}::uuid)
        AND (${input.farmId ?? null}::uuid IS NULL OR "farm_id" = ${input.farmId ?? null}::uuid)
        AND (${input.sessionId ?? null}::uuid IS NULL OR "session_id" = ${input.sessionId ?? null}::uuid)
      ORDER BY "created_at" DESC
      LIMIT ${limit}
    `;
    return rows.map(mapRun);
  }

  async getRun(id: string): Promise<MarketplaceRunRecord | undefined> {
    const rows = await this.prisma.$queryRaw<MarketplaceRunRow[]>`
      SELECT
        "id", "user_id", "tenant_id", "farmer_id", "farm_id", "session_id",
        "crop", "result", "created_at"
      FROM "marketplace_intelligence_runs"
      WHERE "id" = ${id}::uuid
      LIMIT 1
    `;
    return rows[0] ? mapRun(rows[0]) : undefined;
  }

  private async queryMarketPrices(crop: string, district?: string): Promise<MarketPricePoint[]> {
    const rows = await this.prisma.$queryRaw<Array<MarketPricePoint>>`
      SELECT
        "crop",
        "market_name" AS "marketName",
        "district",
        "unit",
        to_char("observed_at", 'YYYY-MM-DD') AS "observedAt",
        "wholesale_price_bdt"::float8 AS "wholesalePriceBdt",
        "farmgate_price_bdt"::float8 AS "farmgatePriceBdt"
      FROM "market_prices"
      WHERE
        lower("crop") = ${normalizeText(crop)}
        AND (
          ${district ?? null}::text IS NULL
          OR lower("district") = lower(${district ?? ""})
          OR lower("market_name") LIKE '%' || lower(${district ?? ""}) || '%'
        )
      ORDER BY "observed_at" ASC
    `;
    return rows.map((row) => ({
      ...row,
      wholesalePriceBdt: Number(row.wholesalePriceBdt),
      farmgatePriceBdt: Number(row.farmgatePriceBdt),
    }));
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

interface MarketplaceRunRow {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  farmer_id: string | null;
  farm_id: string | null;
  session_id: string | null;
  crop: string;
  result: unknown;
  created_at: Date;
}

function mapRun(row: MarketplaceRunRow): MarketplaceRunRecord {
  const result = row.result as MarketplaceIntelligenceResult;
  return {
    ...result,
    id: row.id,
    userId: row.user_id ?? undefined,
    tenantId: row.tenant_id ?? undefined,
    farmerId: row.farmer_id ?? undefined,
    farmId: row.farm_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    crop: row.crop,
    createdAt: row.created_at.toISOString(),
  };
}

let defaultStore: MarketplaceStore | undefined;

export function getDefaultMarketplaceStore(): MarketplaceStore {
  defaultStore ??= config.databaseUrl
    ? new PostgresMarketplaceStore(config.databaseUrl)
    : new InMemoryMarketplaceStore();
  return defaultStore;
}

function sortOffers(offers: SupplierOffer[]): SupplierOffer[] {
  return offers
    .sort((a, b) => b.score - a.score || a.totalPriceBdt - b.totalPriceBdt)
    .slice(0, 6);
}

function rankOffer(offer: SupplierOffer): SupplierOffer {
  const priceScore = Math.max(0, 100 - offer.unitPriceBdt * 2);
  const deliveryScore = Math.max(0, 100 - offer.deliveryDays * 15);
  const distanceScore = Math.max(0, 100 - offer.distanceKm / 2);
  const ratingScore = offer.rating * 20;
  const stockScore = offer.quantityAvailable >= offer.requestedQuantity ? 100 : 0;
  const score = Math.round(priceScore * 0.38 + deliveryScore * 0.22 + distanceScore * 0.18 + ratingScore * 0.17 + stockScore * 0.05);

  return {
    ...offer,
    score,
    rankReason: `Ranked from price ${formatBdt(offer.unitPriceBdt)}/${offer.unit}, ${offer.deliveryDays} day delivery, ${offer.distanceKm.toFixed(0)} km distance, and ${offer.rating.toFixed(1)}/5 rating.`,
  };
}

function estimateDistanceKm(
  input: { district?: string; latitude?: number; longitude?: number },
  supplier: { district: string; latitude: number; longitude: number },
): number {
  if (input.latitude !== undefined && input.longitude !== undefined) {
    return haversineKm(input.latitude, input.longitude, supplier.latitude, supplier.longitude);
  }
  if (input.district && normalizeText(input.district) === normalizeText(supplier.district)) {
    return 8;
  }
  return 85;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = degreesToRadians(lat2 - lat1);
  const dLon = degreesToRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degreesToRadians(lat1)) * Math.cos(degreesToRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function matchesNeed(normalizedNeed: string, itemName: string, category: string): boolean {
  return normalizeText(itemName).includes(normalizedNeed) || normalizedNeed.includes(normalizeText(itemName)) || normalizeText(category).includes(normalizedNeed);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function stableSeedId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  return Math.min(Math.max(limit ?? fallback, 1), 100);
}

function formatBdt(value: number): string {
  return `BDT ${value.toFixed(value % 1 === 0 ? 0 : 1)}`;
}
