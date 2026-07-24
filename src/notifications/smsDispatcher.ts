/**
 * Proactive-alert SMS delivery (P2, BDAPPS-INTEGRATION-PLAN Flow C).
 *
 * The Temporal sweeps compute weather/plan alerts into `proactive_alerts` but
 * do not reach the farmer. This module delivers pending alerts off-app by SMS
 * to the farmer's BDApps channel (masked subscriberId), so "the agent keeps
 * advising through harvest" is literally true — the phone buzzes even when the
 * app is closed.
 *
 * Reachability is gated on channel activation (subscriberStore/FarmerProfile):
 * no masked id → alert is marked `skipped_no_channel`, never lost. Consumed by:
 * the Temporal sweep activities (post-insert) and the dev deliver route.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { bdapps as defaultBdapps, isSuccess, type BdappsApi } from "../bdapps/index.js";
import { getMaskedSubscriber } from "../bdapps/subscriberStore.js";

export interface PendingAlertRow {
  id: string;
  title: string;
  message: string;
  recommendation: string;
  severity: string;
  bdappsMobile: string;
  bdappsSubscriberId: string | null;
  preferredLanguage: string | null;
}

export interface DeliverResult {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Compact farmer-friendly alert text (≤ ~160 chars is ideal for one SMS). */
export function formatAlertMessage(a: {
  title: string;
  message: string;
  recommendation: string;
  severity: string;
}): string {
  const icon = a.severity === "warning" ? "⚠️" : "🌾";
  return `AgriSense ${icon} ${a.title}: ${a.message} ${a.recommendation}`.trim();
}

/** The masked address to reach a farmer, or undefined if the channel is inactive. */
export function resolveAlertTarget(row: {
  bdappsMobile: string;
  bdappsSubscriberId: string | null;
}): string | undefined {
  // Persisted masked id (channel activation) wins; else the in-memory / env-seed
  // resolver; else unreachable.
  if (row.bdappsSubscriberId) return row.bdappsSubscriberId;
  return getMaskedSubscriber(row.bdappsMobile);
}

/**
 * Deliver a single alert row. Pure of DB — testable with a mock bdapps client.
 * Returns the delivery outcome to persist.
 */
export async function deliverOne(
  row: PendingAlertRow,
  bdapps: BdappsApi = defaultBdapps,
): Promise<{ status: "sent" | "skipped_no_channel" | "failed"; smsMessageId?: string }> {
  const target = resolveAlertTarget(row);
  if (!target) return { status: "skipped_no_channel" };

  try {
    const res = await bdapps.sendSms(target, formatAlertMessage(row));
    if (isSuccess(res)) {
      const messageId = res.destinationResponses?.[0]?.messageId ?? res.requestId;
      return { status: "sent", smsMessageId: messageId };
    }
    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}

/**
 * Deliver all pending alerts that have a reachable farmer. Best-effort; a
 * failure on one alert never blocks the rest. Idempotent by delivery_status.
 */
export async function deliverPendingAlerts(
  opts: { limit?: number; bdapps?: BdappsApi } = {},
): Promise<DeliverResult> {
  if (!config.databaseUrl) return { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  const bdapps = opts.bdapps ?? defaultBdapps;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });

  try {
    const rows = await prisma.$queryRaw<PendingAlertRow[]>`
      SELECT
        a."id",
        a."title",
        a."message",
        a."recommendation",
        a."severity",
        fp."bdapps_mobile"        AS "bdappsMobile",
        fp."bdapps_subscriber_id" AS "bdappsSubscriberId",
        fp."preferred_language"   AS "preferredLanguage"
      FROM "proactive_alerts" a
      JOIN "farm_profiles"    f  ON f."id" = a."farm_id"
      JOIN "farmer_profiles"  fp ON fp."id" = f."farmer_id"
      WHERE a."delivery_status" = 'pending'
        AND fp."bdapps_mobile" IS NOT NULL
      ORDER BY a."created_at" ASC
      LIMIT ${opts.limit ?? 20}
    `;

    const result: DeliverResult = { scanned: rows.length, sent: 0, skipped: 0, failed: 0 };
    for (const row of rows) {
      const outcome = await deliverOne(row, bdapps);
      if (outcome.status === "sent") result.sent++;
      else if (outcome.status === "skipped_no_channel") result.skipped++;
      else result.failed++;

      await prisma.$executeRaw`
        UPDATE "proactive_alerts"
        SET "delivery_status" = ${outcome.status},
            "sms_message_id"  = ${outcome.smsMessageId ?? null},
            "delivered_at"    = ${outcome.status === "sent" ? new Date() : null}
        WHERE "id" = ${row.id}::uuid
      `;
    }
    return result;
  } finally {
    await prisma.$disconnect();
  }
}
