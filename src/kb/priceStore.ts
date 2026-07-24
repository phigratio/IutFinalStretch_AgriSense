/**
 * Price resolution (navid/kb §4.4). Given price observations for a crop, resolve the one the
 * finance engine should use, with precedence: tenant (local + fresh) > hub same district >
 * hub nearest market / most recent. Mock rows are never returned on the Tier 0 path. The result
 * carries full provenance so the trace can prove where the revenue number came from.
 */

import { normalizePricePerKg, type PriceUnit } from "../engines/financials.js";
import { HUB } from "./tenancy.js";

export interface PriceObservationLike {
  tenantId: string;
  cropId: string;
  district?: string;
  market?: string;
  latitude?: number;
  longitude?: number;
  price: number;
  unit: string;
  priceType: string;
  observedAt: string; // YYYY-MM-DD
  source: string;
  sourceUrl?: string;
  dataOrigin: string; // real | manual | mock
  verification?: string;
  commodityLabel?: string;
}

export interface PriceProvenance {
  tenantId: string;
  source: string;
  market?: string;
  district?: string;
  observedAt: string;
  priceType: string;
  rawPrice: number;
  unit: string;
  dataOrigin: string;
  /** How the row was chosen: local | hub_district | hub_nearest | hub_recent. */
  basis: "local" | "hub_district" | "hub_nearest" | "hub_recent";
}

export interface ResolvedPrice {
  pricePerKg: number;
  provenance: PriceProvenance;
}

export interface PriceSignal {
  signal: "sell_now" | "store" | "wait";
  changePct: number;
  observations: number;
  from: string;
  to: string;
}

/** Simple declared Tier-2 trend signal; callers must present it as historical, not a forecast. */
export function resolvePriceSignalFrom(observations: PriceObservationLike[], cropId: string): PriceSignal | null {
  const rows = observations
    .filter((o) => o.cropId === cropId && o.dataOrigin !== "mock")
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows.at(-1)!;
  const start = normalizePricePerKg(first.price, first.unit as PriceUnit);
  const end = normalizePricePerKg(last.price, last.unit as PriceUnit);
  const changePct = Math.round(((end - start) / start) * 1000) / 10;
  return {
    signal: changePct >= 5 ? "wait" : changePct <= -5 ? "sell_now" : "store",
    changePct, observations: rows.length, from: first.observedAt, to: last.observedAt,
  };
}

export interface ResolveOptions {
  cropId: string;
  district?: string;
  /** The farmer's tenant (non-hub); its local prices win. */
  tenantId?: string;
  farmLat?: number;
  farmLon?: number;
}

const eqDistrict = (a?: string, b?: string): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const mostRecent = (rows: PriceObservationLike[]): PriceObservationLike | undefined =>
  rows.length ? rows.reduce((a, b) => (b.observedAt > a.observedAt ? b : a)) : undefined;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function toResolved(row: PriceObservationLike, basis: PriceProvenance["basis"]): ResolvedPrice {
  return {
    pricePerKg: normalizePricePerKg(row.price, (row.unit as PriceUnit) ?? "kg"),
    provenance: {
      tenantId: row.tenantId,
      source: row.source,
      market: row.market,
      district: row.district,
      observedAt: row.observedAt,
      priceType: row.priceType,
      rawPrice: row.price,
      unit: row.unit,
      dataOrigin: row.dataOrigin,
      basis,
    },
  };
}

/** Pure resolver over a candidate list (mock isolation + precedence). */
export function resolvePriceFrom(
  observations: PriceObservationLike[],
  opts: ResolveOptions,
): ResolvedPrice | null {
  const candidates = observations.filter(
    (o) => o.cropId === opts.cropId && o.dataOrigin !== "mock",
  );
  if (candidates.length === 0) return null;

  // 1. Tenant-local (fresh + local).
  if (opts.tenantId && opts.tenantId !== HUB) {
    const local = mostRecent(candidates.filter((o) => o.tenantId === opts.tenantId));
    if (local) return toResolved(local, "local");
  }

  const hub = candidates.filter((o) => o.tenantId === HUB);

  // 2. Hub, same district.
  if (opts.district) {
    const sameDistrict = mostRecent(hub.filter((o) => eqDistrict(o.district, opts.district)));
    if (sameDistrict) return toResolved(sameDistrict, "hub_district");
  }

  // 3. Hub nearest market by farm coords, else most recent hub row.
  if (opts.farmLat != null && opts.farmLon != null) {
    const withCoords = hub.filter((o) => o.latitude != null && o.longitude != null);
    if (withCoords.length) {
      const nearest = withCoords.reduce((best, o) =>
        haversineKm(opts.farmLat!, opts.farmLon!, o.latitude!, o.longitude!) <
        haversineKm(opts.farmLat!, opts.farmLon!, best.latitude!, best.longitude!)
          ? o
          : best,
      );
      return toResolved(nearest, "hub_nearest");
    }
  }
  const recent = mostRecent(hub);
  return recent ? toResolved(recent, "hub_recent") : null;
}

// ---- Store abstraction (in-memory for tests; Prisma impl in the app) --------

export interface PriceStore {
  addObservations(obs: PriceObservationLike[]): Promise<void>;
  listByCrop(cropId: string): Promise<PriceObservationLike[]>;
  resolve(opts: ResolveOptions): Promise<ResolvedPrice | null>;
}

export class InMemoryPriceStore implements PriceStore {
  private rows: PriceObservationLike[] = [];

  async addObservations(obs: PriceObservationLike[]): Promise<void> {
    this.rows.push(...obs);
  }

  async listByCrop(cropId: string): Promise<PriceObservationLike[]> {
    return this.rows.filter((o) => o.cropId === cropId);
  }

  async resolve(opts: ResolveOptions): Promise<ResolvedPrice | null> {
    return resolvePriceFrom(this.rows, opts);
  }

  reset(): void {
    this.rows.length = 0;
  }
}
