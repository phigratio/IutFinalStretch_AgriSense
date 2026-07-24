CREATE TABLE IF NOT EXISTS "marketplace_suppliers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "district" text NOT NULL,
  "latitude" numeric(9, 6),
  "longitude" numeric(9, 6),
  "rating" numeric(3, 2) NOT NULL DEFAULT 0,
  "delivery_days" integer NOT NULL DEFAULT 3,
  "seeded" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "marketplace_suppliers_name_district_key" UNIQUE ("name", "district")
);

CREATE INDEX IF NOT EXISTS "marketplace_suppliers_district_idx" ON "marketplace_suppliers"("district");
CREATE INDEX IF NOT EXISTS "marketplace_suppliers_rating_idx" ON "marketplace_suppliers"("rating");

CREATE TABLE IF NOT EXISTS "marketplace_supplier_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" uuid NOT NULL REFERENCES "marketplace_suppliers"("id") ON DELETE CASCADE,
  "item_name" text NOT NULL,
  "category" text NOT NULL,
  "unit" text NOT NULL,
  "price_bdt" numeric(12, 2) NOT NULL,
  "stock_quantity" numeric(12, 2) NOT NULL,
  "seeded" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "marketplace_supplier_items_supplier_id_item_name_unit_key" UNIQUE ("supplier_id", "item_name", "unit")
);

CREATE INDEX IF NOT EXISTS "marketplace_supplier_items_item_name_idx" ON "marketplace_supplier_items"("item_name");
CREATE INDEX IF NOT EXISTS "marketplace_supplier_items_category_idx" ON "marketplace_supplier_items"("category");
CREATE INDEX IF NOT EXISTS "marketplace_supplier_items_price_bdt_idx" ON "marketplace_supplier_items"("price_bdt");

CREATE TABLE IF NOT EXISTS "market_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "crop" text NOT NULL,
  "market_name" text NOT NULL,
  "district" text NOT NULL,
  "unit" text NOT NULL,
  "observed_at" date NOT NULL,
  "wholesale_price_bdt" numeric(12, 2) NOT NULL,
  "farmgate_price_bdt" numeric(12, 2) NOT NULL,
  "seeded" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "market_prices_crop_market_name_observed_at_key" UNIQUE ("crop", "market_name", "observed_at")
);

CREATE INDEX IF NOT EXISTS "market_prices_crop_idx" ON "market_prices"("crop");
CREATE INDEX IF NOT EXISTS "market_prices_district_idx" ON "market_prices"("district");
CREATE INDEX IF NOT EXISTS "market_prices_observed_at_idx" ON "market_prices"("observed_at");

CREATE TABLE IF NOT EXISTS "marketplace_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "farm_id" uuid REFERENCES "farm_profiles"("id") ON DELETE SET NULL,
  "supplier_id" uuid NOT NULL REFERENCES "marketplace_suppliers"("id") ON DELETE RESTRICT,
  "supplier_item_id" uuid NOT NULL REFERENCES "marketplace_supplier_items"("id") ON DELETE RESTRICT,
  "quantity" numeric(12, 2) NOT NULL,
  "unit" text NOT NULL,
  "unit_price_bdt" numeric(12, 2) NOT NULL,
  "total_price_bdt" numeric(12, 2) NOT NULL,
  "status" text NOT NULL DEFAULT 'quoted',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "marketplace_orders_farm_id_idx" ON "marketplace_orders"("farm_id");
CREATE INDEX IF NOT EXISTS "marketplace_orders_supplier_id_idx" ON "marketplace_orders"("supplier_id");
CREATE INDEX IF NOT EXISTS "marketplace_orders_status_idx" ON "marketplace_orders"("status");
