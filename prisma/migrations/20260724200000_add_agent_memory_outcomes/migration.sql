CREATE TABLE IF NOT EXISTS "agent_memory_outcomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "app_users"("id") ON DELETE SET NULL,
  "farmer_id" uuid REFERENCES "farmer_profiles"("id") ON DELETE CASCADE,
  "farm_id" uuid REFERENCES "farm_profiles"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "agent_sessions"("id") ON DELETE SET NULL,
  "plan_id" uuid REFERENCES "season_plans"("id") ON DELETE SET NULL,
  "kind" text NOT NULL CHECK ("kind" IN (
    'farm_fact',
    'crop_decision',
    'financial_result',
    'risk_warning',
    'pending_task',
    'farmer_preference'
  )),
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "value_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "score" numeric(8, 2) NOT NULL DEFAULT 0,
  "source_trace_ids" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "agent_memory_outcomes_user_id_idx" ON "agent_memory_outcomes"("user_id");
CREATE INDEX IF NOT EXISTS "agent_memory_outcomes_farmer_id_idx" ON "agent_memory_outcomes"("farmer_id");
CREATE INDEX IF NOT EXISTS "agent_memory_outcomes_farm_id_idx" ON "agent_memory_outcomes"("farm_id");
CREATE INDEX IF NOT EXISTS "agent_memory_outcomes_session_id_idx" ON "agent_memory_outcomes"("session_id");
CREATE INDEX IF NOT EXISTS "agent_memory_outcomes_plan_id_idx" ON "agent_memory_outcomes"("plan_id");
CREATE INDEX IF NOT EXISTS "agent_memory_outcomes_kind_idx" ON "agent_memory_outcomes"("kind");
CREATE INDEX IF NOT EXISTS "agent_memory_outcomes_score_idx" ON "agent_memory_outcomes"("score");
