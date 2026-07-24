CREATE TABLE IF NOT EXISTS "scenario_simulations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid REFERENCES "agent_sessions"("id") ON DELETE SET NULL,
  "farm_id" uuid REFERENCES "farm_profiles"("id") ON DELETE SET NULL,
  "plan_id" uuid REFERENCES "season_plans"("id") ON DELETE SET NULL,
  "scenario_label" text NOT NULL,
  "scenario_input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "baseline_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scenario_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "delta_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "recommendation" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "scenario_simulations_session_id_idx" ON "scenario_simulations"("session_id");
CREATE INDEX IF NOT EXISTS "scenario_simulations_farm_id_idx" ON "scenario_simulations"("farm_id");
CREATE INDEX IF NOT EXISTS "scenario_simulations_plan_id_idx" ON "scenario_simulations"("plan_id");
CREATE INDEX IF NOT EXISTS "scenario_simulations_created_at_idx" ON "scenario_simulations"("created_at");
