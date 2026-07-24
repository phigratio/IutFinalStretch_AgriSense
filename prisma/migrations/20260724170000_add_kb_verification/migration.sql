ALTER TABLE "kb_documents"
  ADD COLUMN IF NOT EXISTS "verification_status" TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS "retrieved_at" TIMESTAMPTZ(6);
