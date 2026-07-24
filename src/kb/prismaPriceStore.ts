/**
 * Postgres-backed PriceStore (used when DATABASE_URL is set). Mirrors the auth store's
 * PrismaPg adapter usage. Reads resolve through the same pure `resolvePriceFrom` as the
 * in-memory store, so precedence/provenance behaviour is identical.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import {
  resolvePriceFrom,
  type PriceStore,
  type PriceObservationLike,
  type ResolveOptions,
  type ResolvedPrice,
} from "./priceStore.js";

export class PrismaPriceStore implements PriceStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async addObservations(obs: PriceObservationLike[]): Promise<void> {
    if (obs.length === 0) return;
    const data = obs.map((o) => ({
        tenantId: o.tenantId,
        cropId: o.cropId,
        commodityLabel: o.commodityLabel ?? null,
        district: o.district ?? null,
        market: o.market ?? null,
        latitude: o.latitude ?? null,
        longitude: o.longitude ?? null,
        price: o.price,
        unit: o.unit,
        priceType: o.priceType,
        observedAt: new Date(o.observedAt),
        source: o.source,
        sourceUrl: o.sourceUrl ?? null,
        dataOrigin: o.dataOrigin,
        verification: o.verification ?? "unverified",
      }));

    // WFP refreshes and tenant retries must be idempotent. PostgreSQL treats NULLs as
    // distinct in compound unique indexes, so use an explicit delete+create transaction
    // over the natural observation key instead of relying on skipDuplicates.
    await this.prisma.$transaction([
      this.prisma.priceObservation.deleteMany({
        where: {
          OR: obs.map((o) => ({
            tenantId: o.tenantId,
            cropId: o.cropId,
            market: o.market ?? null,
            observedAt: new Date(o.observedAt),
            priceType: o.priceType,
            source: o.source,
          })),
        },
      }),
      this.prisma.priceObservation.createMany({ data }),
    ]);
  }

  async listByCrop(cropId: string): Promise<PriceObservationLike[]> {
    const rows = await this.prisma.priceObservation.findMany({ where: { cropId } });
    return rows.map((r) => ({
      tenantId: r.tenantId,
      cropId: r.cropId,
      district: r.district ?? undefined,
      market: r.market ?? undefined,
      latitude: r.latitude != null ? Number(r.latitude) : undefined,
      longitude: r.longitude != null ? Number(r.longitude) : undefined,
      price: Number(r.price),
      unit: r.unit,
      priceType: r.priceType,
      observedAt: r.observedAt.toISOString().slice(0, 10),
      source: r.source,
      sourceUrl: r.sourceUrl ?? undefined,
      dataOrigin: r.dataOrigin,
      verification: r.verification,
      commodityLabel: r.commodityLabel ?? undefined,
    }));
  }

  async resolve(opts: ResolveOptions): Promise<ResolvedPrice | null> {
    return resolvePriceFrom(await this.listByCrop(opts.cropId), opts);
  }
}
