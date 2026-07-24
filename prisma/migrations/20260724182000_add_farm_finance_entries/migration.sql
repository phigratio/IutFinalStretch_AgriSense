CREATE TABLE IF NOT EXISTS "farm_finance_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "farm_id" uuid REFERENCES "farm_profiles"("id") ON DELETE SET NULL,
  "season_plan_id" uuid REFERENCES "season_plans"("id") ON DELETE SET NULL,
  "entry_type" text NOT NULL CHECK ("entry_type" IN ('income', 'expense')),
  "category" text NOT NULL,
  "label" text NOT NULL,
  "amount_bdt" numeric(12, 2) NOT NULL CHECK ("amount_bdt" >= 0),
  "entry_date" date NOT NULL,
  "season" text,
  "crop" text,
  "source" text NOT NULL DEFAULT 'manual',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "farm_finance_entries_farm_id_idx" ON "farm_finance_entries"("farm_id");
CREATE INDEX IF NOT EXISTS "farm_finance_entries_season_plan_id_idx" ON "farm_finance_entries"("season_plan_id");
CREATE INDEX IF NOT EXISTS "farm_finance_entries_entry_date_idx" ON "farm_finance_entries"("entry_date");
CREATE INDEX IF NOT EXISTS "farm_finance_entries_season_idx" ON "farm_finance_entries"("season");
CREATE INDEX IF NOT EXISTS "farm_finance_entries_source_idx" ON "farm_finance_entries"("source");
