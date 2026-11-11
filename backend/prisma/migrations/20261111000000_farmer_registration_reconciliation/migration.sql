-- AlterTable
ALTER TABLE "farmers" ADD COLUMN     "register_tx_valid_until" TIMESTAMP(3),
ADD COLUMN     "registered_at" TIMESTAMP(3);


-- Registrations sent before this migration were stored only once confirmed.
UPDATE "farmers" SET "registered_at" = COALESCE("linked_at", "updated_at") WHERE "register_tx" IS NOT NULL;
