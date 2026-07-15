-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "sync_service";

-- CreateEnum
CREATE TYPE "sync_service"."SyncDirection" AS ENUM ('UPLOAD', 'DOWNLOAD');

-- CreateEnum
CREATE TYPE "sync_service"."SyncBatchStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "sync_service"."SyncNetworkType" AS ENUM ('WIFI', 'MOBILE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "sync_service"."SyncOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'UPSERT');

-- CreateEnum
CREATE TYPE "sync_service"."SyncItemStatus" AS ENUM ('QUEUED', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "sync_service"."sync_batches" (
    "sync_batch_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "direction" "sync_service"."SyncDirection" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "status" "sync_service"."SyncBatchStatus" NOT NULL,
    "app_version" VARCHAR(40),
    "network_type" "sync_service"."SyncNetworkType",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sync_batches_pkey" PRIMARY KEY ("sync_batch_id")
);

-- CreateTable
CREATE TABLE "sync_service"."sync_items" (
    "sync_item_id" TEXT NOT NULL,
    "sync_batch_id" TEXT NOT NULL,
    "local_entity_uuid" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" TEXT,
    "operation" "sync_service"."SyncOperation" NOT NULL,
    "status" "sync_service"."SyncItemStatus" NOT NULL,
    "error_code" VARCHAR(80),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sync_items_pkey" PRIMARY KEY ("sync_item_id")
);

-- AddForeignKey
ALTER TABLE "sync_service"."sync_items" ADD CONSTRAINT "sync_items_sync_batch_id_fkey" FOREIGN KEY ("sync_batch_id") REFERENCES "sync_service"."sync_batches"("sync_batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

