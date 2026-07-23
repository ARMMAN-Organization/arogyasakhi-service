-- CreateEnum
CREATE TYPE "IncentiveRateType" AS ENUM ('VISIT', 'REFERRAL', 'MEETING', 'TRAINING', 'RETAINER');

-- CreateEnum
CREATE TYPE "IncentiveVisitType" AS ENUM ('REGISTRATION_MOTHER', 'REGISTRATION_CHILD', 'ANC', 'ANC_HR', 'DELIVERY', 'PP', 'PP_HR', 'NN', 'NN_HR', 'INC', 'INC_HR', 'CCV', 'CCV_HR', 'REFERRAL_FOLLOWUP', 'CLOSURE_MOTHER', 'CLOSURE_CHILD');

-- CreateEnum
CREATE TYPE "IncentiveReferralType" AS ENUM ('STANDARD', 'ACCOMPANIED');

-- CreateEnum
CREATE TYPE "IncentiveEligibilityStatus" AS ENUM ('ELIGIBLE', 'INELIGIBLE', 'PENDING', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayoutBatchStatus" AS ENUM ('DRAFT', 'GENERATED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "incentive_rates" (
    "rate_id" TEXT NOT NULL,
    "rate_type" "IncentiveRateType" NOT NULL,
    "visit_type" "IncentiveVisitType",
    "referral_type" "IncentiveReferralType",
    "geography_unit_id" TEXT,
    "amount_inr" DECIMAL(10,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "changed_by_user_id" TEXT NOT NULL,
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "incentive_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "incentive_events" (
    "incentive_event_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "source_entity_type" "IncentiveRateType" NOT NULL,
    "source_entity_id" TEXT,
    "event_month" DATE NOT NULL,
    "rate_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "amount_inr" DECIMAL(10,2) NOT NULL,
    "eligibility_status" "IncentiveEligibilityStatus" NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "incentive_events_pkey" PRIMARY KEY ("incentive_event_id")
);

-- CreateTable
CREATE TABLE "payout_batches" (
    "payout_batch_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "voucher_month" DATE NOT NULL,
    "batch_status" "PayoutBatchStatus" NOT NULL,
    "generated_at" TIMESTAMP(3),
    "generated_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payout_batches_pkey" PRIMARY KEY ("payout_batch_id")
);

-- CreateTable
CREATE TABLE "payout_lines" (
    "payout_line_id" TEXT NOT NULL,
    "payout_batch_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "visit_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "referral_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "monthly_visit_charges" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "meeting_honorarium" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "training_honorarium" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "retainer_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_payout" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "bank_snapshot_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "payout_lines_pkey" PRIMARY KEY ("payout_line_id")
);

-- AddForeignKey
ALTER TABLE "incentive_events" ADD CONSTRAINT "incentive_events_rate_id_fkey" FOREIGN KEY ("rate_id") REFERENCES "incentive_rates"("rate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_payout_batch_id_fkey" FOREIGN KEY ("payout_batch_id") REFERENCES "payout_batches"("payout_batch_id") ON DELETE RESTRICT ON UPDATE CASCADE;

