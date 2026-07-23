-- CreateEnum
CREATE TYPE "SupervisorEventType" AS ENUM ('MEETING', 'TRAINING');

-- CreateEnum
CREATE TYPE "SupervisorEventStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'PARTIAL');

-- CreateEnum
CREATE TYPE "InventoryItemCategory" AS ENUM ('CONSUMABLE', 'INSTRUMENT');

-- CreateEnum
CREATE TYPE "InventoryItemStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('HANDOVER', 'RETURNED', 'PERMANENT_DAMAGED', 'MISPLACED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('CONNECTED', 'NOT_CONNECTED', 'FOLLOWUP_REQUIRED', 'BUSY', 'SWITCHED_OFF', 'WRONG_NUMBER');

-- CreateTable
CREATE TABLE "supervisor_events" (
    "event_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "event_type" "SupervisorEventType" NOT NULL,
    "event_date" DATE NOT NULL,
    "topics_json" JSONB NOT NULL,
    "remarks" TEXT,
    "status" "SupervisorEventStatus" NOT NULL,
    "photo_media_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "supervisor_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "event_attendance" (
    "attendance_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "attendance_status" "AttendanceStatus" NOT NULL,
    "pre_training_score" DECIMAL(5,2),
    "post_training_score" DECIMAL(5,2),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("attendance_id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "item_id" TEXT NOT NULL,
    "item_code" VARCHAR(80) NOT NULL,
    "item_name" VARCHAR(160) NOT NULL,
    "item_category" "InventoryItemCategory" NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "status" "InventoryItemStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "inventory_txn_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "transaction_type" "InventoryTransactionType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "transaction_date" DATE NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("inventory_txn_id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "call_log_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "call_datetime" TIMESTAMP(3) NOT NULL,
    "call_status" "CallStatus" NOT NULL,
    "notes" TEXT,
    "followup_action" TEXT,
    "call_start_at" TIMESTAMP(3) NOT NULL,
    "call_end_at" TIMESTAMP(3),
    "call_duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("call_log_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_item_code_key" ON "inventory_items"("item_code");

-- AddForeignKey
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "supervisor_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

