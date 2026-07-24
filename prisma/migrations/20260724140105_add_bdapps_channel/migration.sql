-- Add BDApps SMS-channel + premium tracking to farmer_profiles.
-- (Earlier this file also contained an out-of-order mega-diff that referenced
-- marketplace_* / proactive_alerts tables created by *later* migrations, which
-- made `migrate deploy` fail on a fresh database. Reduced to the columns this
-- migration is actually meant to add.)

-- AlterTable
ALTER TABLE "farmer_profiles"
  ADD COLUMN "bdapps_subscriber_id" TEXT,
  ADD COLUMN "channel_activated_at" TIMESTAMPTZ(6),
  ADD COLUMN "premium" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "premium_since" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "farmer_profiles_bdapps_subscriber_id_idx" ON "farmer_profiles"("bdapps_subscriber_id");
