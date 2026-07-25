/**
 * Temporal connectivity smoke test: connect to the cluster (TEMPORAL_ADDRESS),
 * ensure the AgriSense schedules exist, and describe them. Retries while the
 * auto-setup image registers the default namespace.
 * Run: npx tsx --env-file=.env scripts/check-temporal.ts
 */
import { createTemporalClient, temporalAddress } from "../src/temporal/client.js";
import { ensureAgriSenseSchedules, describeAgriSenseSchedules } from "../src/temporal/schedules.js";

async function main(): Promise<void> {
  console.log("Temporal address:", temporalAddress());
  for (let i = 1; i <= 8; i++) {
    try {
      const client = await createTemporalClient();
      const ensured = await ensureAgriSenseSchedules(client);
      const described = (await describeAgriSenseSchedules(client)) as Array<{ scheduleId: string; exists: boolean }>;
      console.log("ensure:", JSON.stringify(ensured));
      console.log("schedules:", described.map((s) => ({ id: s.scheduleId, exists: s.exists })));
      console.log("\n✅ Temporal live: schedules ensured + described.");
      process.exit(0);
    } catch (error) {
      console.log(`attempt ${i}: ${(error as Error).message.slice(0, 100)} - retrying...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log("\n❌ Temporal not ready after retries.");
  process.exit(2);
}

void main();
