-- CreateEnum
CREATE TYPE "ClosureType" AS ENUM ('MEDICAL', 'NON_MEDICAL', 'PROGRAM_COMPLETION');

-- CreateEnum
CREATE TYPE "ClosureSupervisorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReopenRequestReason" AS ENUM ('MIGRATION_RETURNED', 'CLOSED_BY_MISTAKE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReopenSupervisorStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "closures" (
    "closure_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "closure_type" "ClosureType" NOT NULL,
    "closure_reason_lookup_value_id" TEXT NOT NULL,
    "event_date" DATE,
    "closure_date" DATE NOT NULL,
    "submitted_by_user_id" TEXT NOT NULL,
    "supervisor_status" "ClosureSupervisorStatus",
    "supervisor_id" TEXT,
    "supervisor_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "closures_pkey" PRIMARY KEY ("closure_id")
);

-- CreateTable
CREATE TABLE "reopen_requests" (
    "reopen_request_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "request_reason" "ReopenRequestReason" NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "supervisor_status" "ReopenSupervisorStatus" NOT NULL DEFAULT 'PENDING',
    "decision_reason_code_lookup_id" TEXT,
    "decision_notes" TEXT,
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "supervisor_id" TEXT,
    "supervisor_rejection_reason_code_lookup_id" TEXT,
    "supervisor_rejection_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reopen_requests_pkey" PRIMARY KEY ("reopen_request_id")
);

