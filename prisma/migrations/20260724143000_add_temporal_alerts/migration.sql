CREATE TABLE IF NOT EXISTS "proactive_alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "farm_id" uuid REFERENCES "farm_profiles"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "agent_sessions"("id") ON DELETE SET NULL,
  "plan_id" uuid REFERENCES "season_plans"("id") ON DELETE SET NULL,
  "alert_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',
  "title" text NOT NULL,
  "message" text NOT NULL,
  "recommendation" text NOT NULL,
  "rule_id" text NOT NULL,
  "trigger_date" date,
  "raw_evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "fingerprint" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'open',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "proactive_alerts_farm_id_idx" ON "proactive_alerts"("farm_id");
CREATE INDEX IF NOT EXISTS "proactive_alerts_session_id_idx" ON "proactive_alerts"("session_id");
CREATE INDEX IF NOT EXISTS "proactive_alerts_alert_type_idx" ON "proactive_alerts"("alert_type");
CREATE INDEX IF NOT EXISTS "proactive_alerts_status_idx" ON "proactive_alerts"("status");

CREATE TABLE IF NOT EXISTS "temporal_job_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workflow_type" text NOT NULL,
  "workflow_id" text,
  "status" text NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text
);

CREATE INDEX IF NOT EXISTS "temporal_job_runs_workflow_type_idx" ON "temporal_job_runs"("workflow_type");
CREATE INDEX IF NOT EXISTS "temporal_job_runs_started_at_idx" ON "temporal_job_runs"("started_at");
