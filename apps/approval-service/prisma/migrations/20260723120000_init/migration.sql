-- CreateEnum
CREATE TYPE "ApprovalRequestType" AS ENUM ('LMP_CHANGE', 'REFERRAL_SKIP', 'ACCOMPANIED_REFERRAL', 'CLOSURE_REVIEW', 'REOPEN', 'DATA_RESTORE', 'TRANSFER');

-- CreateTable
CREATE TABLE "approval_requests" (
    "approval_request_id" TEXT NOT NULL,
    "request_type" "ApprovalRequestType" NOT NULL,
    "beneficiary_id" TEXT,
    "source_entity_type" VARCHAR(80) NOT NULL,
    "source_entity_id" TEXT NOT NULL,
    "source_submission_id" TEXT,
    "decision_reason_code_lookup_id" TEXT,
    "decision_notes" TEXT,
    "decided_by_user_id" TEXT,
    "source_answer_id" TEXT,
    "referral_id" TEXT,
    "closure_id" TEXT,
    "reopen_request_id" TEXT,
    "requested_by_user_id" TEXT NOT NULL,
    "approver_user_id" TEXT,
    "request_payload_json" JSONB,
    "decision_status_lookup_id" TEXT NOT NULL,
    "decision_payload_json" JSONB,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("approval_request_id")
);

