CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "rag_memories" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "agent_id" TEXT,
  "run_id" TEXT,
  "role" TEXT NOT NULL DEFAULT 'memory',
  "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "embedding" vector(1536) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rag_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rag_memories_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "rag_memories_user_id_idx" ON "rag_memories"("user_id");
CREATE INDEX IF NOT EXISTS "rag_memories_agent_id_idx" ON "rag_memories"("agent_id");
CREATE INDEX IF NOT EXISTS "rag_memories_run_id_idx" ON "rag_memories"("run_id");
CREATE INDEX IF NOT EXISTS "rag_memories_embedding_hnsw_idx"
  ON "rag_memories" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "rag_documents" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "source_type" TEXT NOT NULL DEFAULT 'extension_manual',
  "source" TEXT NOT NULL,
  "title" TEXT,
  "citation_url" TEXT,
  "crop" TEXT,
  "region" TEXT,
  "language" TEXT NOT NULL DEFAULT 'en',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rag_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rag_documents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "rag_documents_user_id_idx" ON "rag_documents"("user_id");
CREATE INDEX IF NOT EXISTS "rag_documents_source_idx" ON "rag_documents"("source");

CREATE TABLE IF NOT EXISTS "rag_document_chunks" (
  "id" UUID NOT NULL,
  "document_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "section" TEXT,
  "crop" TEXT,
  "season" TEXT,
  "soil_type" TEXT,
  "token_count" INTEGER,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "embedding" vector(1536) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rag_document_chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rag_document_chunks_document_id_ordinal_key" UNIQUE ("document_id", "ordinal"),
  CONSTRAINT "rag_document_chunks_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "rag_documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "rag_document_chunks_document_id_idx" ON "rag_document_chunks"("document_id");
CREATE INDEX IF NOT EXISTS "rag_document_chunks_embedding_hnsw_idx"
  ON "rag_document_chunks" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "farmer_profiles" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "bdapps_mobile" TEXT,
  "preferred_name" TEXT,
  "preferred_language" TEXT NOT NULL DEFAULT 'en',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "farmer_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "farmer_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "farmer_profiles_user_id_idx" ON "farmer_profiles"("user_id");
CREATE INDEX IF NOT EXISTS "farmer_profiles_bdapps_mobile_idx" ON "farmer_profiles"("bdapps_mobile");

CREATE TABLE IF NOT EXISTS "farm_profiles" (
  "id" UUID NOT NULL,
  "farmer_id" UUID NOT NULL,
  "name" TEXT,
  "location_text" TEXT NOT NULL,
  "latitude" DECIMAL(9, 6),
  "longitude" DECIMAL(9, 6),
  "size_acres" DECIMAL(10, 2) NOT NULL,
  "soil_type" TEXT NOT NULL,
  "water_availability" TEXT NOT NULL,
  "budget_bdt" DECIMAL(12, 2) NOT NULL,
  "target_season" TEXT NOT NULL,
  "current_crop" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "farm_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "farm_profiles_farmer_id_fkey"
    FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "farm_profiles_farmer_id_idx" ON "farm_profiles"("farmer_id");
CREATE INDEX IF NOT EXISTS "farm_profiles_location_text_idx" ON "farm_profiles"("location_text");

CREATE TABLE IF NOT EXISTS "agent_sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "farmer_id" UUID,
  "farm_id" UUID,
  "channel" TEXT NOT NULL DEFAULT 'web',
  "status" TEXT NOT NULL DEFAULT 'intake',
  "missing_fields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "goal" TEXT,
  "summary" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "agent_sessions_farmer_id_fkey"
    FOREIGN KEY ("farmer_id") REFERENCES "farmer_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "agent_sessions_farm_id_fkey"
    FOREIGN KEY ("farm_id") REFERENCES "farm_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_sessions_user_id_idx" ON "agent_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "agent_sessions_farmer_id_idx" ON "agent_sessions"("farmer_id");
CREATE INDEX IF NOT EXISTS "agent_sessions_farm_id_idx" ON "agent_sessions"("farm_id");
CREATE INDEX IF NOT EXISTS "agent_sessions_status_idx" ON "agent_sessions"("status");

CREATE TABLE IF NOT EXISTS "agent_tool_calls" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "tool_name" TEXT NOT NULL,
  "purpose" TEXT,
  "parameters" JSONB NOT NULL DEFAULT '{}',
  "raw_response" JSONB,
  "status" TEXT NOT NULL DEFAULT 'success',
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),

  CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_tool_calls_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_tool_calls_session_id_idx" ON "agent_tool_calls"("session_id");
CREATE INDEX IF NOT EXISTS "agent_tool_calls_tool_name_idx" ON "agent_tool_calls"("tool_name");

CREATE TABLE IF NOT EXISTS "weather_snapshots" (
  "id" UUID NOT NULL,
  "session_id" UUID,
  "farm_id" UUID,
  "provider" TEXT NOT NULL,
  "location_text" TEXT NOT NULL,
  "forecast_date" DATE NOT NULL,
  "rainfall_mm" DECIMAL(8, 2),
  "temperature_min_c" DECIMAL(5, 2),
  "temperature_max_c" DECIMAL(5, 2),
  "humidity_pct" DECIMAL(5, 2),
  "raw_response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "weather_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weather_snapshots_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "weather_snapshots_farm_id_fkey"
    FOREIGN KEY ("farm_id") REFERENCES "farm_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "weather_snapshots_session_id_idx" ON "weather_snapshots"("session_id");
CREATE INDEX IF NOT EXISTS "weather_snapshots_farm_id_idx" ON "weather_snapshots"("farm_id");
CREATE INDEX IF NOT EXISTS "weather_snapshots_forecast_date_idx" ON "weather_snapshots"("forecast_date");

CREATE TABLE IF NOT EXISTS "season_plans" (
  "id" UUID NOT NULL,
  "session_id" UUID,
  "farm_id" UUID NOT NULL,
  "crop" TEXT NOT NULL,
  "rank" INTEGER,
  "suitability_score" DECIMAL(5, 2),
  "water_need" TEXT NOT NULL,
  "risk_level" TEXT NOT NULL,
  "reasoning" TEXT NOT NULL,
  "retrieved_chunk_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "weather_snapshot_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expected_yield_unit" TEXT NOT NULL DEFAULT 'kg',
  "expected_yield" DECIMAL(12, 2) NOT NULL,
  "expected_revenue_bdt" DECIMAL(12, 2) NOT NULL,
  "total_cost_bdt" DECIMAL(12, 2) NOT NULL,
  "net_profit_bdt" DECIMAL(12, 2) NOT NULL,
  "roi_pct" DECIMAL(8, 2) NOT NULL,
  "break_even_yield" DECIMAL(12, 2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "season_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "season_plans_session_id_fkey"
    FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "season_plans_farm_id_fkey"
    FOREIGN KEY ("farm_id") REFERENCES "farm_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "season_plans_session_id_idx" ON "season_plans"("session_id");
CREATE INDEX IF NOT EXISTS "season_plans_farm_id_idx" ON "season_plans"("farm_id");
CREATE INDEX IF NOT EXISTS "season_plans_crop_idx" ON "season_plans"("crop");

CREATE TABLE IF NOT EXISTS "season_plan_items" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "item_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "start_date" DATE,
  "end_date" DATE,
  "quantity" DECIMAL(12, 2),
  "unit" TEXT,
  "unit_cost_bdt" DECIMAL(12, 2),
  "total_cost_bdt" DECIMAL(12, 2),
  "reasoning" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "season_plan_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "season_plan_items_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "season_plans"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "season_plan_items_plan_id_idx" ON "season_plan_items"("plan_id");
CREATE INDEX IF NOT EXISTS "season_plan_items_item_type_idx" ON "season_plan_items"("item_type");

CREATE TABLE IF NOT EXISTS "bdapps_payments" (
  "id" UUID NOT NULL,
  "user_id" UUID,
  "plan_id" UUID,
  "mobile" TEXT NOT NULL,
  "amount_bdt" DECIMAL(12, 2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "external_reference" TEXT,
  "request_payload" JSONB NOT NULL DEFAULT '{}',
  "response_payload" JSONB,
  "receipt_number" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bdapps_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bdapps_payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "bdapps_payments_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "season_plans"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bdapps_payments_user_id_idx" ON "bdapps_payments"("user_id");
CREATE INDEX IF NOT EXISTS "bdapps_payments_plan_id_idx" ON "bdapps_payments"("plan_id");
CREATE INDEX IF NOT EXISTS "bdapps_payments_mobile_idx" ON "bdapps_payments"("mobile");
CREATE INDEX IF NOT EXISTS "bdapps_payments_status_idx" ON "bdapps_payments"("status");
