-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- DropIndex
DROP INDEX "farmers_wallet_address_key";

-- AlterTable
ALTER TABLE "farmers" DROP COLUMN "wallet_address";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fund_tx" TEXT,
ADD COLUMN     "fund_tx_valid_until" TIMESTAMP(3),
ADD COLUMN     "funded_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "integration_events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "http_status" INTEGER,
    "response" JSONB,
    "tx_hash" TEXT,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_events_source_event_id_key" ON "integration_events"("source", "event_id");

