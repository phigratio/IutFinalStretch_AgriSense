/**
 * KB runtime — the active price/tenant stores and the price ingester, chosen from the
 * environment (Postgres when DATABASE_URL is set, else in-memory) and overridable for tests.
 * Mirrors the auth store's getDefault* pattern + the agent route's setRuntime pattern.
 */

import { config } from "../config.js";
import { InMemoryPriceStore, type PriceStore } from "./priceStore.js";
import { PrismaPriceStore } from "./prismaPriceStore.js";
import { InMemoryTenantStore, type TenantStore } from "./tenancy.js";
import { InMemoryTableOverrideStore, type TableOverrideStore } from "./tableStore.js";
import { PrismaTenantStore, PrismaTableOverrideStore } from "./prismaTenantStore.js";
import { ingestWfpPrices, type IngestedPrice } from "./ingest/wfpPrices.js";

export interface KbRuntime {
  priceStore: PriceStore;
  tenantStore: TenantStore;
  tableStore: TableOverrideStore;
  /** Pull hub prices (real WFP by default; injectable for offline tests). */
  ingestHubPrices: (opts?: { sinceDate?: string }) => Promise<IngestedPrice[]>;
}

function buildDefault(): KbRuntime {
  const dbUrl = config.databaseUrl;
  return {
    priceStore: dbUrl ? new PrismaPriceStore(dbUrl) : new InMemoryPriceStore(),
    tenantStore: dbUrl ? new PrismaTenantStore(dbUrl) : new InMemoryTenantStore(),
    tableStore: dbUrl ? new PrismaTableOverrideStore(dbUrl) : new InMemoryTableOverrideStore(),
    ingestHubPrices: (opts) => ingestWfpPrices({}, { sinceDate: opts?.sinceDate }),
  };
}

let runtime: KbRuntime | null = null;

export function getKbRuntime(): KbRuntime {
  runtime ??= buildDefault();
  return runtime;
}

/** Override parts of the runtime (tests / DI). */
export function setKbRuntime(partial: Partial<KbRuntime>): void {
  runtime = { ...getKbRuntime(), ...partial };
}
