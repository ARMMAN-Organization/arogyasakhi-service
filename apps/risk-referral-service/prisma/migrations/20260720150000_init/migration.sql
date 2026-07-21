-- CreateEnum
CREATE TYPE "RiskEntityType" AS ENUM ('MOTHER', 'CHILD');

-- CreateEnum
CREATE TYPE "RiskPhase" AS ENUM ('REGISTRATION', 'ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV');

-- CreateEnum
CREATE TYPE "RiskGradeScale" AS ENUM ('BINARY', 'NORMAL_MILD_MODERATE_SEVERE', 'NORMAL_LOW_MEDIUM_HIGH');

-- CreateEnum
CREATE TYPE "RiskConditionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OverallRiskCategory" AS ENUM ('NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskStatePhase" AS ENUM ('ANC', 'PP', 'NN', 'INC', 'CCV', 'ANC_REGISTRATION', 'INC_REGISTRATION');

-- CreateEnum
CREATE TYPE "CcvState" AS ENUM ('NEVER_HR', 'CURRENTLY_HR_SAM_DANGER', 'CURRENTLY_HR_OTHER', 'RECENTLY_RECOVERED', 'STABLE_LOW_RISK');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('PUBLIC', 'PRIVATE', 'PHC', 'RH', 'DH', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('INITIATED', 'PENDING_FOLLOWUP', 'COMPLETED', 'LAPSED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupervisorApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReferralFollowupStatus" AS ENUM ('PENDING', 'COMPLETED', 'INCOMPLETE', 'LAPSED');

-- CreateTable
CREATE TABLE "risk_conditions" (
    "risk_condition_id" TEXT NOT NULL,
    "condition_code" VARCHAR(80) NOT NULL,
    "condition_name" VARCHAR(180) NOT NULL,
    "entity_type" "RiskEntityType" NOT NULL,
    "phase" "RiskPhase" NOT NULL,
    "grade_scale" "RiskGradeScale" NOT NULL,
    "referral_required_default" BOOLEAN NOT NULL DEFAULT false,
    "education_required_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "RiskConditionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "risk_conditions_pkey" PRIMARY KEY ("risk_condition_id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "risk_assessment_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "visit_id" TEXT,
    "submission_id" TEXT NOT NULL,
    "rule_version_id" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "overall_risk_category" "OverallRiskCategory" NOT NULL,
    "overall_high_risk_flag" BOOLEAN NOT NULL DEFAULT false,
    "hr_detected_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("risk_assessment_id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "risk_flag_id" TEXT NOT NULL,
    "risk_assessment_id" TEXT NOT NULL,
    "risk_condition_id" TEXT NOT NULL,
    "risk_grade_lookup_value_id" TEXT NOT NULL,
    "observed_value_json" JSONB,
    "is_referral_trigger" BOOLEAN NOT NULL DEFAULT false,
    "is_education_trigger" BOOLEAN NOT NULL DEFAULT false,
    "is_hr_visit_trigger" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("risk_flag_id")
);

-- CreateTable
CREATE TABLE "risk_state_snapshots" (
    "risk_state_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "phase" "RiskStatePhase" NOT NULL,
    "as_of_date" DATE NOT NULL,
    "baseline_risk_json" JSONB,
    "latest_risk_json" JSONB,
    "ever_at_risk_json" JSONB,
    "source_visit_id" TEXT,
    "ccv_state" "CcvState",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "risk_state_snapshots_pkey" PRIMARY KEY ("risk_state_id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "referral_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "visit_id" TEXT,
    "source_submission_id" TEXT,
    "referral_type_lookup_value_id" TEXT NOT NULL,
    "referral_date" DATE NOT NULL,
    "trigger_condition_list_json" JSONB,
    "facility_type" "FacilityType",
    "facility_name" VARCHAR(200),
    "status" "ReferralStatus" NOT NULL,
    "valid_till" DATE,
    "supervisor_approval_status" "SupervisorApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("referral_id")
);

-- CreateTable
CREATE TABLE "Referral_trigger_sources" (
    "referral_trigger_source_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "risk_flag_id" TEXT,
    "risk_condition_id" TEXT,
    "source_submission_id" TEXT NOT NULL,
    "source_field_code" VARCHAR(100),
    "trigger_reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_trigger_sources_pkey" PRIMARY KEY ("referral_trigger_source_id")
);

-- CreateTable
CREATE TABLE "referral_followups" (
    "followup_id" TEXT NOT NULL,
    "referral_id" TEXT NOT NULL,
    "followup_date" DATE NOT NULL,
    "visited_facility_flag" BOOLEAN,
    "not_visited_reason" VARCHAR(255),
    "diagnosis" TEXT,
    "treatment_given" TEXT,
    "outcome" VARCHAR(255),
    "case_paper_media_id" TEXT,
    "followup_status" "ReferralFollowupStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "referral_followups_pkey" PRIMARY KEY ("followup_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_conditions_condition_code_key" ON "risk_conditions"("condition_code");

-- CreateIndex
CREATE UNIQUE INDEX "visit_referral_once" ON "referrals"("visit_id");

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_risk_assessment_id_fkey" FOREIGN KEY ("risk_assessment_id") REFERENCES "risk_assessments"("risk_assessment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_risk_condition_id_fkey" FOREIGN KEY ("risk_condition_id") REFERENCES "risk_conditions"("risk_condition_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral_trigger_sources" ADD CONSTRAINT "Referral_trigger_sources_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("referral_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_followups" ADD CONSTRAINT "referral_followups_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("referral_id") ON DELETE RESTRICT ON UPDATE CASCADE;

