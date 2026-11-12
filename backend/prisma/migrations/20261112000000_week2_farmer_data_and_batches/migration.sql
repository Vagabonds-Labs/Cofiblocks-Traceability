-- CreateEnum
CREATE TYPE "BatchStage" AS ENUM ('DELIVERED', 'RECEIVED', 'WASHING', 'FERMENTATION', 'DRYING', 'STORAGE', 'IN_TRANSPORT_TO_UNION', 'PREPARED_WITH_EXPORTABLE_BAG', 'SOLD');

-- AlterTable
ALTER TABLE "farmers" ADD COLUMN     "consent_version" TEXT,
ADD COLUMN     "profile" JSONB,
ADD COLUMN     "profile_at" TIMESTAMP(3),
ADD COLUMN     "profile_hash" TEXT,
ADD COLUMN     "profile_tx" TEXT,
ADD COLUMN     "profile_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "farmer_consents" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "integration_event_id" TEXT NOT NULL,
    "consent_version" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "declarations" JSONB NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL,
    "transcript" TEXT,
    "audio_ref" TEXT,
    "consent_hash" TEXT NOT NULL,
    "tx" TEXT,
    "tx_valid_until" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmer_profile_versions" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "integration_event_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "profile" JSONB NOT NULL,
    "profile_hash" TEXT NOT NULL,
    "transcript" TEXT,
    "audio_ref" TEXT,
    "tx" TEXT,
    "tx_valid_until" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farmer_profile_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plots" (
    "id" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "profile_version" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT,
    "size_value" DECIMAL(12,4),
    "size_unit" TEXT,
    "size_hectares" DECIMAL(12,4),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "farmer_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "collection_center_id" TEXT NOT NULL,
    "stage" "BatchStage" NOT NULL DEFAULT 'DELIVERED',
    "integration_event_id" TEXT,
    "delivered_at" TIMESTAMP(3) NOT NULL,
    "estimated_kg" DECIMAL(10,2),
    "ripeness" TEXT,
    "transcript" TEXT,
    "audio_ref" TEXT,
    "data_hash" TEXT NOT NULL,
    "create_tx" TEXT,
    "create_tx_valid_until" TIMESTAMP(3),
    "created_on_chain_at" TIMESTAMP(3),
    "weight_grams" BIGINT,
    "receipt_hash" TEXT,
    "reception_tx" TEXT,
    "received_at" TIMESTAMP(3),
    "received_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_events" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "stage" "BatchStage" NOT NULL,
    "actor_address" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "data_hash" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "tx_hash" TEXT,
    "attached_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "farmer_consents_integration_event_id_key" ON "farmer_consents"("integration_event_id");

-- CreateIndex
CREATE INDEX "farmer_consents_farmer_id_idx" ON "farmer_consents"("farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_profile_versions_integration_event_id_key" ON "farmer_profile_versions"("integration_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmer_profile_versions_farmer_id_version_key" ON "farmer_profile_versions"("farmer_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "plots_farmer_id_position_key" ON "plots"("farmer_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "batches_number_key" ON "batches"("number");

-- CreateIndex
CREATE UNIQUE INDEX "batches_integration_event_id_key" ON "batches"("integration_event_id");

-- CreateIndex
CREATE INDEX "batches_farmer_id_idx" ON "batches"("farmer_id");

-- CreateIndex
CREATE INDEX "batches_organization_id_stage_idx" ON "batches"("organization_id", "stage");

-- CreateIndex
CREATE INDEX "batches_collection_center_id_idx" ON "batches"("collection_center_id");

-- CreateIndex
CREATE UNIQUE INDEX "batch_events_tx_hash_key" ON "batch_events"("tx_hash");

-- CreateIndex
CREATE INDEX "batch_events_batch_id_idx" ON "batch_events"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_batch_id_sha256_key" ON "documents"("batch_id", "sha256");

-- AddForeignKey
ALTER TABLE "farmer_consents" ADD CONSTRAINT "farmer_consents_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_consents" ADD CONSTRAINT "farmer_consents_integration_event_id_fkey" FOREIGN KEY ("integration_event_id") REFERENCES "integration_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_profile_versions" ADD CONSTRAINT "farmer_profile_versions_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmer_profile_versions" ADD CONSTRAINT "farmer_profile_versions_integration_event_id_fkey" FOREIGN KEY ("integration_event_id") REFERENCES "integration_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plots" ADD CONSTRAINT "plots_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_collection_center_id_fkey" FOREIGN KEY ("collection_center_id") REFERENCES "collection_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_integration_event_id_fkey" FOREIGN KEY ("integration_event_id") REFERENCES "integration_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_events" ADD CONSTRAINT "batch_events_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_events" ADD CONSTRAINT "batch_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Same lock-down as 20261111120000_lock_down_public_schema: only the backend
-- (table owner) reads these tables; the Supabase Data API sees no rows.
ALTER TABLE "farmer_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "farmer_profile_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "batch_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
