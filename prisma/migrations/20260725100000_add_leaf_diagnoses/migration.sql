-- Leaf disease detection from images (Tier-2 T2-4; src/vision).
-- Additive: no changes to existing tables. Apply with `prisma migrate deploy`.
CREATE TABLE "leaf_diagnoses" (
    "id" UUID NOT NULL,
    "farmer_id" UUID,
    "farm_id" UUID,
    "session_id" UUID,
    "plan_id" UUID,
    "source" TEXT NOT NULL,
    "crop_id" TEXT,
    "crop_label" TEXT NOT NULL,
    "disease" TEXT NOT NULL,
    "healthy" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DECIMAL(6,4) NOT NULL,
    "severity" TEXT NOT NULL,
    "image_url" TEXT,
    "location_text" TEXT,
    "area_acres" DECIMAL(10,2),
    "citation" TEXT,
    "caution" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "trace" JSONB NOT NULL DEFAULT '[]',
    "source_trace_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leaf_diagnoses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leaf_diagnoses_farmer_id_idx" ON "leaf_diagnoses"("farmer_id");
CREATE INDEX "leaf_diagnoses_farm_id_idx" ON "leaf_diagnoses"("farm_id");
CREATE INDEX "leaf_diagnoses_session_id_idx" ON "leaf_diagnoses"("session_id");
CREATE INDEX "leaf_diagnoses_crop_id_idx" ON "leaf_diagnoses"("crop_id");
CREATE INDEX "leaf_diagnoses_severity_idx" ON "leaf_diagnoses"("severity");
CREATE INDEX "leaf_diagnoses_created_at_idx" ON "leaf_diagnoses"("created_at");
