-- Role-based auth + onboarding (navid). Idempotent + additive.

ALTER TABLE "app_users"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS "tenant_requests" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "org_name" TEXT NOT NULL,
  "district" TEXT NOT NULL,
  "upazila" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decided_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tenant_requests_user_id_idx" ON "tenant_requests"("user_id");
CREATE INDEX IF NOT EXISTS "tenant_requests_status_idx" ON "tenant_requests"("status");

CREATE TABLE IF NOT EXISTS "farmer_onboardings" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "full_name" TEXT,
  "phone" TEXT,
  "district" TEXT NOT NULL,
  "upazila" TEXT,
  "farm_size_decimals" DECIMAL(10,2),
  "soil_texture" TEXT,
  "water_availability" TEXT,
  "budget_bdt" DECIMAL(12,2),
  "target_season" TEXT,
  "filled_by" TEXT NOT NULL DEFAULT 'self',
  "filled_by_user_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "farmer_onboardings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "farmer_onboardings_user_id_key" ON "farmer_onboardings"("user_id");
CREATE INDEX IF NOT EXISTS "farmer_onboardings_district_idx" ON "farmer_onboardings"("district");

CREATE TABLE IF NOT EXISTS "profile_assist_requests" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "full_name" TEXT,
  "phone" TEXT,
  "district" TEXT NOT NULL,
  "upazila" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "claimed_by_tenant_slug" TEXT,
  "claimed_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "profile_assist_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "profile_assist_requests_district_status_idx" ON "profile_assist_requests"("district", "status");
CREATE INDEX IF NOT EXISTS "profile_assist_requests_user_id_idx" ON "profile_assist_requests"("user_id");
