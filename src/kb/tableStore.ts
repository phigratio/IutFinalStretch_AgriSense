/**
 * Structured table overrides (navid/kb §2 / K2). A tenant may override a national agronomy table
 * row (fertilizer dose, calendar, water need, variety, SRDI fertility) for its district; the
 * resolver prefers tenant → hub override → CSV baseline, mirroring the price resolver. The CSV
 * fallback is injected by the caller (it knows which loader to call for a given kind), keeping
 * this store generic and decoupled.
 */

import { HUB } from "./tenancy.js";

export type TableKind = "fertilizer" | "calendar" | "water" | "variety" | "srdi";

export interface TableOverride {
  tenantId: string;
  kind: TableKind;
  cropId: string;
  district?: string;
  payload: unknown;
  source: string;
  dataOrigin: string; // real | manual | mock
}

export interface ResolvedTable {
  payload: unknown;
  provenance: {
    tenantId: string;
    source: string;
    dataOrigin: string;
    basis: "tenant" | "hub" | "csv";
  };
}

export interface ResolveTableRequest {
  kind: TableKind;
  cropId: string;
  tenantId?: string;
  district?: string;
}

const eq = (a?: string, b?: string): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Prefer a district-specific override over a district-less one. */
function pickBest(rows: TableOverride[], district?: string): TableOverride | undefined {
  const usable = rows.filter((r) => r.dataOrigin !== "mock");
  return (
    usable.find((r) => district && eq(r.district, district)) ??
    usable.find((r) => !r.district)
  );
}

/**
 * Resolve a table row: tenant override → hub override → CSV baseline. `csvFallback` returns the
 * national baseline payload (or undefined). Returns null only when nothing is available.
 */
export function resolveTableFrom(
  overrides: TableOverride[],
  req: ResolveTableRequest,
  csvFallback: () => unknown | undefined,
): ResolvedTable | null {
  const forKindCrop = overrides.filter((o) => o.kind === req.kind && o.cropId === req.cropId);

  if (req.tenantId && req.tenantId !== HUB) {
    const local = pickBest(
      forKindCrop.filter((o) => o.tenantId === req.tenantId),
      req.district,
    );
    if (local) {
      return {
        payload: local.payload,
        provenance: { tenantId: local.tenantId, source: local.source, dataOrigin: local.dataOrigin, basis: "tenant" },
      };
    }
  }

  const hub = pickBest(forKindCrop.filter((o) => o.tenantId === HUB), req.district);
  if (hub) {
    return {
      payload: hub.payload,
      provenance: { tenantId: HUB, source: hub.source, dataOrigin: hub.dataOrigin, basis: "hub" },
    };
  }

  const csv = csvFallback();
  if (csv !== undefined && csv !== null) {
    return {
      payload: csv,
      provenance: { tenantId: HUB, source: "src/data CSV baseline", dataOrigin: "manual", basis: "csv" },
    };
  }
  return null;
}

// ---- Store ------------------------------------------------------------------

export interface TableOverrideStore {
  addOverride(o: TableOverride): Promise<void>;
  list(kind: TableKind, cropId: string): Promise<TableOverride[]>;
}

export class InMemoryTableOverrideStore implements TableOverrideStore {
  private rows: TableOverride[] = [];

  async addOverride(o: TableOverride): Promise<void> {
    this.rows.push(o);
  }

  async list(kind: TableKind, cropId: string): Promise<TableOverride[]> {
    return this.rows.filter((o) => o.kind === kind && o.cropId === cropId);
  }

  reset(): void {
    this.rows.length = 0;
  }
}
