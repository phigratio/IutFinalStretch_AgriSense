/**
 * CLI: refresh the hub price baseline from the real WFP/HDX dataset.
 *   npx tsx scripts/kb-refresh-prices.ts [--since 2024-01-01]
 * Writes PriceObservation(tenantId="hub") rows via the active store (Postgres if DATABASE_URL,
 * else in-memory — in-memory is process-local, so use it only to smoke-test the pull).
 */

import { getKbRuntime } from "../src/kb/runtime.js";

async function main(): Promise<void> {
  const sinceArg = process.argv.indexOf("--since");
  const sinceDate = sinceArg >= 0 ? process.argv[sinceArg + 1] : "2024-01-01";

  const { priceStore, ingestHubPrices } = getKbRuntime();
  console.log(`Pulling WFP prices since ${sinceDate} …`);
  const prices = await ingestHubPrices({ sinceDate });
  await priceStore.addObservations(prices);

  const byCrop: Record<string, number> = {};
  for (const p of prices) byCrop[p.cropId] = (byCrop[p.cropId] ?? 0) + 1;
  console.log(`Imported ${prices.length} hub price observations.`);
  const dates = prices.map((p) => p.observedAt).sort();
  console.log(`Trace: retrievedAt=${new Date().toISOString()} rows=${prices.length} dateRange=${dates[0] ?? "n/a"}..${dates.at(-1) ?? "n/a"}`);
  console.table(byCrop);
  if (prices[0]) {
    const p = prices[0];
    console.log(`Sample: ${p.cropId} ${p.district}/${p.market} ${p.price}/${p.unit} ${p.priceType} ${p.observedAt}`);
  }
}

main().catch((err) => {
  console.error("kb-refresh-prices failed:", err);
  process.exit(1);
});
