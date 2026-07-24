CREATE TABLE "kb_ingestion_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "stage" TEXT NOT NULL DEFAULT 'queued',
  "original_name" TEXT NOT NULL,
  "stored_path" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "source_url" TEXT,
  "crop_id" TEXT,
  "doc_type" TEXT NOT NULL DEFAULT 'reference',
  "verification_status" TEXT NOT NULL DEFAULT 'unverified',
  "extracted_chars" INTEGER NOT NULL DEFAULT 0,
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "processed_chunks" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6),
  "finished_at" TIMESTAMPTZ(6),
  CONSTRAINT "kb_ingestion_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "kb_ingestion_jobs_tenant_id_created_at_idx" ON "kb_ingestion_jobs"("tenant_id", "created_at");
CREATE INDEX "kb_ingestion_jobs_status_created_at_idx" ON "kb_ingestion_jobs"("status", "created_at");
