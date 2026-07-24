-- Tier 0 agent path: split soil texture/fertility, canonical area, draft intake state,
-- season-plan break-even price, and weather snapshot type. Idempotent + additive.

ALTER TABLE "farm_profiles"
  ADD COLUMN IF NOT EXISTS "area_ha" DECIMAL(10, 4),
  ADD COLUMN IF NOT EXISTS "soil_texture" TEXT,
  ADD COLUMN IF NOT EXISTS "fertility_class" TEXT,
  ADD COLUMN IF NOT EXISTS "fertility_source" TEXT,
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "upazila" TEXT;

ALTER TABLE "agent_sessions"
  ADD COLUMN IF NOT EXISTS "selected_crop" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "weather_snapshots"
  ADD COLUMN IF NOT EXISTS "snapshot_type" TEXT NOT NULL DEFAULT 'forecast';

ALTER TABLE "season_plans"
  ADD COLUMN IF NOT EXISTS "break_even_price_bdt_per_kg" DECIMAL(12, 2);
