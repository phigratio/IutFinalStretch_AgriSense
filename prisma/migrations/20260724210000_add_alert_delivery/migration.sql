-- BDApps SMS delivery fields for proactive alerts (P2, Flow C).
ALTER TABLE "proactive_alerts" ADD COLUMN "delivery_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "proactive_alerts" ADD COLUMN "sms_message_id" TEXT;
ALTER TABLE "proactive_alerts" ADD COLUMN "delivered_at" TIMESTAMPTZ(6);
CREATE INDEX "proactive_alerts_delivery_status_idx" ON "proactive_alerts"("delivery_status");
