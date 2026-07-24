CREATE TABLE IF NOT EXISTS "marketplace_intelligence_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE SET NULL,
  "farmer_id" uuid REFERENCES "farmer_profiles"("id") ON DELETE SET NULL,
  "farm_id" uuid REFERENCES "farm_profiles"("id") ON DELETE SET NULL,
  "session_id" uuid REFERENCES "agent_sessions"("id") ON DELETE SET NULL,
  "item_name" text NOT NULL,
  "quantity" numeric(12, 2) NOT NULL,
  "unit" text NOT NULL,
  "district" text,
  "crop" text NOT NULL,
  "result" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "marketplace_intelligence_runs_user_id_idx" ON "marketplace_intelligence_runs"("user_id");
CREATE INDEX IF NOT EXISTS "marketplace_intelligence_runs_tenant_id_idx" ON "marketplace_intelligence_runs"("tenant_id");
CREATE INDEX IF NOT EXISTS "marketplace_intelligence_runs_farmer_id_idx" ON "marketplace_intelligence_runs"("farmer_id");
CREATE INDEX IF NOT EXISTS "marketplace_intelligence_runs_farm_id_idx" ON "marketplace_intelligence_runs"("farm_id");
CREATE INDEX IF NOT EXISTS "marketplace_intelligence_runs_session_id_idx" ON "marketplace_intelligence_runs"("session_id");
CREATE INDEX IF NOT EXISTS "marketplace_intelligence_runs_created_at_idx" ON "marketplace_intelligence_runs"("created_at");
