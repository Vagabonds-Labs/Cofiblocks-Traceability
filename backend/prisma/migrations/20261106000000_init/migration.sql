-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('COLLECTOR', 'COMMITTEE_MEMBER', 'INDUSTRY_MANAGER', 'STORE_KEEPER', 'EXPORT_MANAGER');

-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('COOPERATIVE', 'UNION');

-- CreateEnum
CREATE TYPE "FarmerStatus" AS ENUM ('PRELOADED', 'LINKED', 'REGISTERED', 'CONSENTED');

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('WARNING', 'INFO', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "telegram_username" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "wallet_address" TEXT,
    "wallet_provider" TEXT,
    "role" "StaffRole",
    "organization_id" TEXT,
    "collection_center_id" TEXT,
    "role_tx" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "wallet_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_info" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "key" TEXT NOT NULL,
    "arguments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "level" "NotificationLevel" NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logs" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "kind" "OrganizationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "region" TEXT,
    "zone" TEXT,
    "woreda" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farmers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "coop_farmer_id" TEXT NOT NULL,
    "collection_center_id" TEXT,
    "full_name" TEXT,
    "phone" TEXT,
    "telegram_user_id" BIGINT,
    "telegram_username" TEXT,
    "language" TEXT,
    "status" "FarmerStatus" NOT NULL DEFAULT 'PRELOADED',
    "wallet_address" TEXT,
    "register_tx" TEXT,
    "consent_hash" TEXT,
    "consent_tx" TEXT,
    "consent_at" TIMESTAMP(3),
    "linked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farmers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_conversations" (
    "chat_id" BIGINT NOT NULL,
    "farmer_id" TEXT,
    "language" TEXT,
    "step" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_conversations_pkey" PRIMARY KEY ("chat_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "auth_nonces_nonce_key" ON "auth_nonces"("nonce");

-- CreateIndex
CREATE INDEX "auth_nonces_expires_at_idx" ON "auth_nonces"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_session_id_key" ON "refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_chain_id_key" ON "organizations"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_centers_chain_id_key" ON "collection_centers"("chain_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_centers_organization_id_name_key" ON "collection_centers"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "farmers_telegram_user_id_key" ON "farmers"("telegram_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "farmers_wallet_address_key" ON "farmers"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "farmers_organization_id_coop_farmer_id_key" ON "farmers"("organization_id", "coop_farmer_id");

-- CreateIndex
CREATE UNIQUE INDEX "bot_conversations_farmer_id_key" ON "bot_conversations"("farmer_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_collection_center_id_fkey" FOREIGN KEY ("collection_center_id") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_centers" ADD CONSTRAINT "collection_centers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_collection_center_id_fkey" FOREIGN KEY ("collection_center_id") REFERENCES "collection_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_conversations" ADD CONSTRAINT "bot_conversations_farmer_id_fkey" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

