CREATE TABLE IF NOT EXISTS "pest_disease_assessments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "farmer_id" uuid REFERENCES "farmer_profiles"("id") ON DELETE SET NULL,
  "farm_id" uuid REFERENCES "farm_profiles"("id") ON DELETE SET NULL,
  "session_id" uuid REFERENCES "agent_sessions"("id") ON DELETE SET NULL,
  "plan_id" uuid REFERENCES "season_plans"("id") ON DELETE SET NULL,
  "crop_id" text NOT NULL,
  "crop_label" text NOT NULL,
  "growth_stage" text NOT NULL,
  "days_after_sowing" integer,
  "location_text" text NOT NULL,
  "area_acres" numeric(10, 2) NOT NULL,
  "highest_severity" text NOT NULL,
  "risks" jsonb NOT NULL,
  "weather" jsonb NOT NULL,
  "trace" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_trace_ids" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pest_disease_assessments_farmer_id_idx" ON "pest_disease_assessments"("farmer_id");
CREATE INDEX IF NOT EXISTS "pest_disease_assessments_farm_id_idx" ON "pest_disease_assessments"("farm_id");
CREATE INDEX IF NOT EXISTS "pest_disease_assessments_session_id_idx" ON "pest_disease_assessments"("session_id");
CREATE INDEX IF NOT EXISTS "pest_disease_assessments_plan_id_idx" ON "pest_disease_assessments"("plan_id");
CREATE INDEX IF NOT EXISTS "pest_disease_assessments_crop_id_idx" ON "pest_disease_assessments"("crop_id");
CREATE INDEX IF NOT EXISTS "pest_disease_assessments_highest_severity_idx" ON "pest_disease_assessments"("highest_severity");
CREATE INDEX IF NOT EXISTS "pest_disease_assessments_created_at_idx" ON "pest_disease_assessments"("created_at");
