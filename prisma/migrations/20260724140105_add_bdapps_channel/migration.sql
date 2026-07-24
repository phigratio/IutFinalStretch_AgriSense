-- DropForeignKey
ALTER TABLE "marketplace_orders" DROP CONSTRAINT "marketplace_orders_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_orders" DROP CONSTRAINT "marketplace_orders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_orders" DROP CONSTRAINT "marketplace_orders_supplier_item_id_fkey";

-- DropForeignKey
ALTER TABLE "marketplace_supplier_items" DROP CONSTRAINT "marketplace_supplier_items_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "proactive_alerts" DROP CONSTRAINT "proactive_alerts_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "proactive_alerts" DROP CONSTRAINT "proactive_alerts_plan_id_fkey";

-- DropForeignKey
ALTER TABLE "proactive_alerts" DROP CONSTRAINT "proactive_alerts_session_id_fkey";

-- DropIndex
DROP INDEX "rag_document_chunks_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "rag_memories_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "agent_sessions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "app_users" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "auth_identities" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "bdapps_payments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "farm_profiles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "farmer_onboardings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "farmer_profiles" ADD COLUMN     "bdapps_subscriber_id" TEXT,
ADD COLUMN     "channel_activated_at" TIMESTAMPTZ(6),
ADD COLUMN     "premium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "premium_since" TIMESTAMPTZ(6),
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "kb_ingestion_jobs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "kb_table_overrides" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "market_prices" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketplace_orders" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketplace_supplier_items" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "marketplace_suppliers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "proactive_alerts" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "profile_assist_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rag_documents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rag_memories" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "season_plans" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "temporal_job_runs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenant_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "farmer_profiles_bdapps_subscriber_id_idx" ON "farmer_profiles"("bdapps_subscriber_id");

-- AddForeignKey
ALTER TABLE "marketplace_supplier_items" ADD CONSTRAINT "marketplace_supplier_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "marketplace_suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farm_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "marketplace_suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_supplier_item_id_fkey" FOREIGN KEY ("supplier_item_id") REFERENCES "marketplace_supplier_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
