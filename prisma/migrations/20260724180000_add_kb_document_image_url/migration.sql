-- KB document image (Cloudinary URL) surfaced with retrieval hits.
ALTER TABLE "kb_documents" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
