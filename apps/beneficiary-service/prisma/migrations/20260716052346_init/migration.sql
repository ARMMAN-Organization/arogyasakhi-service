-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ChildSex" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'INTERSEX');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('MOTHER', 'CHILD');

-- CreateEnum
CREATE TYPE "BeneficiaryStatus" AS ENUM ('ACTIVE', 'JOURNEY_COMPLETE', 'CLOSED', 'TRANSFERRED', 'REOPEN_REQUESTED');

-- CreateEnum
CREATE TYPE "CasePhase" AS ENUM ('ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV', 'CLOSED');

-- CreateEnum
CREATE TYPE "MotherCasePhase" AS ENUM ('ANC', 'DELIVERY', 'PP', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChildCasePhase" AS ENUM ('NN', 'INC', 'CCV', 'CLOSED');

-- CreateEnum
CREATE TYPE "CcvOpeningRiskState" AS ENUM ('NEVER_HR', 'CURRENTLY_HR_SAM_DANGER', 'CURRENTLY_HR_OTHER', 'RECENTLY_RECOVERED', 'STABLE_LOW_RISK');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PROGRAM_ENROLLMENT');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GIVEN', 'REFUSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SummaryPhase" AS ENUM ('REGISTRATION', 'ANC', 'DELIVERY', 'PP', 'NN', 'INFANT_FOLLOWUP', 'CLOSURE');

-- CreateTable
CREATE TABLE "beneficiary_pii" (
    "pii_id" TEXT NOT NULL,
    "full_name_enc" BYTEA NOT NULL,
    "full_name_search_hash" BYTEA NOT NULL,
    "phone_enc" BYTEA,
    "phone_search_hash" BYTEA,
    "alternate_phone_enc" BYTEA,
    "village_id" TEXT,
    "pada_id" TEXT,
    "health_sub_centre_id" TEXT,
    "phc_id" TEXT,
    "health_block_id" TEXT,
    "date_of_birth" DATE,
    "sex" "Sex",
    "address_line_enc" TEXT,
    "state_id" TEXT,
    "district_id" TEXT,
    "taluka_id" TEXT,
    "rch_number_enc" BYTEA,
    "rch_number_hash" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "beneficiary_pii_pkey" PRIMARY KEY ("pii_id")
);

-- CreateTable
CREATE TABLE "Beneficiary_search_tokens" (
    "search_token_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "name_token" VARCHAR(128),
    "dob_token" VARCHAR(128),
    "lmp_date_token" VARCHAR(128),
    "geography_token" VARCHAR(128),
    "case_type_lookup_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Beneficiary_search_tokens_pkey" PRIMARY KEY ("search_token_id")
);

-- CreateTable
CREATE TABLE "beneficiary_cases" (
    "beneficiary_id" TEXT NOT NULL,
    "pii_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "case_type" "CaseType" NOT NULL,
    "pregnancy_sequence_no" INTEGER,
    "previous_beneficiary_id" TEXT,
    "mother_beneficiary_id" TEXT,
    "sakhi_id" TEXT NOT NULL,
    "registration_date" DATE NOT NULL,
    "current_status" "BeneficiaryStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_phase" "CasePhase" NOT NULL,
    "beneficiary_type_lookup_id" TEXT NOT NULL,
    "case_type_lookup_id" TEXT NOT NULL,
    "journey_start_date" DATE NOT NULL,
    "journey_end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "beneficiary_cases_pkey" PRIMARY KEY ("beneficiary_id")
);

-- CreateTable
CREATE TABLE "mother_case_details" (
    "mother_case_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "lmp_date" DATE NOT NULL,
    "edd_date" DATE NOT NULL,
    "gravida" INTEGER,
    "parity" INTEGER,
    "height_cm" DECIMAL(5,2),
    "registration_submission_id" TEXT,
    "bmi_at_registration" DECIMAL(5,2),
    "baseline_risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "current_phase" "MotherCasePhase" NOT NULL DEFAULT 'ANC',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "mother_case_details_pkey" PRIMARY KEY ("mother_case_id")
);

-- CreateTable
CREATE TABLE "child_case_details" (
    "child_case_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "mother_beneficiary_id" TEXT,
    "date_of_birth" DATE NOT NULL,
    "sex" "ChildSex",
    "birth_weight_kg" DECIMAL(5,2),
    "birth_length_cm" DECIMAL(5,2),
    "premature_flag" BOOLEAN,
    "linked_anc_case" BOOLEAN NOT NULL DEFAULT false,
    "current_phase" "ChildCasePhase" NOT NULL DEFAULT 'NN',
    "ccv_opening_risk_state" "CcvOpeningRiskState",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "child_case_details_pkey" PRIMARY KEY ("child_case_id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "consent_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "consent_status" "ConsentStatus" NOT NULL,
    "consent_date" DATE NOT NULL,
    "media_asset_id" TEXT,
    "captured_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("consent_id")
);

-- CreateTable
CREATE TABLE "Beneficiary_risk_condition_summary" (
    "beneficiary_risk_condition_summary_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "risk_condition_id" TEXT NOT NULL,
    "phase" "SummaryPhase" NOT NULL,
    "baseline_grade" VARCHAR(50),
    "baseline_observed_value_json" JSONB,
    "baseline_visit_id" TEXT,
    "baseline_submission_id" TEXT,
    "baseline_assessed_at" TIMESTAMP(3),
    "latest_grade" VARCHAR(50),
    "latest_observed_value_json" JSONB,
    "latest_visit_id" TEXT,
    "latest_submission_id" TEXT,
    "latest_assessed_at" TIMESTAMP(3),
    "ever_highest_grade" VARCHAR(50),
    "ever_highest_observed_value_json" JSONB,
    "ever_highest_visit_id" TEXT,
    "ever_highest_submission_id" TEXT,
    "ever_highest_assessed_at" TIMESTAMP(3),
    "ever_at_risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "current_referral_trigger_flag" BOOLEAN NOT NULL DEFAULT false,
    "current_hr_visit_trigger_flag" BOOLEAN NOT NULL DEFAULT false,
    "source_rule_version_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_risk_condition_summary_pkey" PRIMARY KEY ("beneficiary_risk_condition_summary_id")
);

-- CreateTable
CREATE TABLE "beneficiary_status_history" (
    "status_history_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "from_status" "BeneficiaryStatus",
    "to_status" "BeneficiaryStatus" NOT NULL,
    "reason_code" VARCHAR(80),
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "beneficiary_status_history_pkey" PRIMARY KEY ("status_history_id")
);

-- CreateTable
CREATE TABLE "Beneficiary_current_summary" (
    "beneficiary_id" TEXT NOT NULL,
    "pii_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "case_type_lookup_id" TEXT NOT NULL,
    "current_status_lookup_id" TEXT NOT NULL,
    "dob" DATE,
    "lmp_date" DATE,
    "edd_date" DATE,
    "date_of_delivery" DATE,
    "closure_date" DATE,
    "active_flag" BOOLEAN NOT NULL DEFAULT true,
    "overall_ever_at_risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "latest_visit_high_risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "referral_active_flag" BOOLEAN NOT NULL DEFAULT false,
    "last_visit_id" TEXT,
    "last_visit_date" DATE,
    "state_id" TEXT,
    "district_id" TEXT,
    "block_geography_unit_id" TEXT,
    "panchayat_id" TEXT,
    "village_geography_unit_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_current_summary_pkey" PRIMARY KEY ("beneficiary_id")
);

-- CreateIndex
CREATE INDEX "beneficiary_pii_full_name_search_hash_idx" ON "beneficiary_pii"("full_name_search_hash");

-- CreateIndex
CREATE INDEX "beneficiary_pii_phone_search_hash_idx" ON "beneficiary_pii"("phone_search_hash");

-- CreateIndex
CREATE INDEX "beneficiary_pii_date_of_birth_idx" ON "beneficiary_pii"("date_of_birth");

-- CreateIndex
CREATE INDEX "beneficiary_pii_rch_number_hash_idx" ON "beneficiary_pii"("rch_number_hash");

-- CreateIndex
CREATE UNIQUE INDEX "mother_case_details_beneficiary_id_key" ON "mother_case_details"("beneficiary_id");

-- CreateIndex
CREATE UNIQUE INDEX "child_case_details_beneficiary_id_key" ON "child_case_details"("beneficiary_id");

-- AddForeignKey
ALTER TABLE "Beneficiary_search_tokens" ADD CONSTRAINT "Beneficiary_search_tokens_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_cases" ADD CONSTRAINT "beneficiary_cases_pii_id_fkey" FOREIGN KEY ("pii_id") REFERENCES "beneficiary_pii"("pii_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_cases" ADD CONSTRAINT "beneficiary_cases_previous_beneficiary_id_fkey" FOREIGN KEY ("previous_beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_cases" ADD CONSTRAINT "beneficiary_cases_mother_beneficiary_id_fkey" FOREIGN KEY ("mother_beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mother_case_details" ADD CONSTRAINT "mother_case_details_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "child_case_details" ADD CONSTRAINT "child_case_details_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary_risk_condition_summary" ADD CONSTRAINT "Beneficiary_risk_condition_summary_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiary_status_history" ADD CONSTRAINT "beneficiary_status_history_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary_current_summary" ADD CONSTRAINT "Beneficiary_current_summary_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiary_cases"("beneficiary_id") ON DELETE RESTRICT ON UPDATE CASCADE;
