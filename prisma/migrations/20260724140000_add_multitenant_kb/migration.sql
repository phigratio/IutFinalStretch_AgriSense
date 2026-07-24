-- Multi-tenant knowledge base (navid/kb): tenants + jurisdictions + members, tenant-scoped
-- price observations (the critical live-data path), table overrides, and prose doc registry.
-- Idempotent + additive.

CREATE TABLE IF NOT EXISTS "tenants" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'district',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_slug_key" ON "tenants"("slug");

CREATE TABLE IF NOT EXISTS "tenant_jurisdictions" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "district" TEXT NOT NULL,
  "upazila" TEXT,
  CONSTRAINT "tenant_jurisdictions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_jurisdictions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_jurisdictions_tenant_id_district_upazila_key"
  ON "tenant_jurisdictions"("tenant_id", "district", "upazila");
CREATE INDEX IF NOT EXISTS "tenant_jurisdictions_district_idx" ON "tenant_jurisdictions"("district");

CREATE TABLE IF NOT EXISTS "tenant_members" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_members_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_members_tenant_id_user_id_key"
  ON "tenant_members"("tenant_id", "user_id");
CREATE INDEX IF NOT EXISTS "tenant_members_user_id_idx" ON "tenant_members"("user_id");

CREATE TABLE IF NOT EXISTS "price_observations" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "crop_id" TEXT NOT NULL,
  "commodity_label" TEXT,
  "district" TEXT,
  "market" TEXT,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "price" DECIMAL(12,4) NOT NULL,
  "unit" TEXT NOT NULL,
  "price_type" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "observed_at" DATE NOT NULL,
  "source" TEXT NOT NULL,
  "source_url" TEXT,
  "data_origin" TEXT NOT NULL,
  "verification" TEXT NOT NULL DEFAULT 'unverified',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "price_observations_crop_id_district_observed_at_idx"
  ON "price_observations"("crop_id", "district", "observed_at");
CREATE INDEX IF NOT EXISTS "price_observations_tenant_id_idx" ON "price_observations"("tenant_id");

CREATE TABLE IF NOT EXISTS "kb_table_overrides" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "crop_id" TEXT NOT NULL,
  "district" TEXT,
  "payload" JSONB NOT NULL,
  "source" TEXT NOT NULL,
  "data_origin" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kb_table_overrides_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "kb_table_overrides_kind_crop_id_district_idx"
  ON "kb_table_overrides"("kind", "crop_id", "district");
CREATE INDEX IF NOT EXISTS "kb_table_overrides_tenant_id_idx" ON "kb_table_overrides"("tenant_id");

CREATE TABLE IF NOT EXISTS "kb_documents" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "doc_key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "source_url" TEXT,
  "page" TEXT,
  "crop_id" TEXT,
  "mem0_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "data_origin" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kb_documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "kb_documents_tenant_id_doc_key_key"
  ON "kb_documents"("tenant_id", "doc_key");
CREATE INDEX IF NOT EXISTS "kb_documents_scope_idx" ON "kb_documents"("scope");
