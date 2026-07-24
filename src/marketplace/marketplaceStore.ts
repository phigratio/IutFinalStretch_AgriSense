import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { marketPriceSeeds, supplierSeeds } from "./seedData.js";
import { type MarketPricePoint, type SupplierOffer } from "./types.js";

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
  close?(): Promise<void>;
}

export class InMemoryMarketplaceStore implements MarketplaceStore {
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
          "id", "name", "district", "latitude", "longitude", "rating", "delivery_days", "seeded"
        )
        VALUES (
          ${supplierId}::uuid,
          ${supplier.name},
          ${supplier.district},
          ${supplier.latitude},
          ${supplier.longitude},
          ${supplier.rating},
          ${supplier.deliveryDays},
          true
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
            "id", "supplier_id", "item_name", "category", "unit", "price_bdt", "stock_quantity", "seeded"
          )
          VALUES (
            ${randomUUID()}::uuid,
            ${savedSupplierId}::uuid,
            ${item.itemName},
            ${item.category},
            ${item.unit},
            ${item.priceBdt},
            ${item.stockQuantity},
            true
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

function formatBdt(value: number): string {
  return `BDT ${value.toFixed(value % 1 === 0 ? 0 : 1)}`;
}
