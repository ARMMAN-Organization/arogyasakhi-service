-- CreateEnum
CREATE TYPE "VisitCodeType" AS ENUM ('ANC', 'ANC_HR', 'ANC_POST_EDD', 'DELIVERY', 'PP', 'NN', 'INC', 'INC_HR', 'CCV', 'CCV_HR');

-- CreateEnum
CREATE TYPE "AnchorType" AS ENUM ('REGISTRATION', 'LMP', 'EDD', 'DELIVERY_DATE', 'DOB', 'ACTUAL_VISIT', 'CCV_TRANSITION');

-- CreateEnum
CREATE TYPE "VisitScheduleStatus" AS ENUM ('GENERATED', 'OPEN', 'MISSED', 'COMPLETED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitInstanceStatus" AS ENUM ('STARTED', 'PENDING', 'MISSED', 'COMPLETED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "FormEntityType" AS ENUM ('MOTHER', 'CHILD', 'REFERRAL', 'SUPERVISOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FormDefinitionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "FormVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "FormValidationStatus" AS ENUM ('VALID', 'INVALID', 'WARNING');

-- CreateTable
CREATE TABLE "visit_schedules" (
    "schedule_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "visit_code" VARCHAR(40) NOT NULL,
    "visit_type" "VisitCodeType" NOT NULL,
    "sequence_no" INTEGER,
    "scheduled_date" DATE NOT NULL,
    "window_start_date" DATE NOT NULL,
    "window_end_date" DATE NOT NULL,
    "anchor_type" "AnchorType" NOT NULL,
    "anchor_visit_id" TEXT,
    "generated_by_rule_version_id" TEXT NOT NULL,
    "status" "VisitScheduleStatus" NOT NULL DEFAULT 'GENERATED',
    "trigger_source_visit_id" BIGINT,
    "trigger_risk_assessment_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "visit_schedules_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateTable
CREATE TABLE "visit_instances" (
    "visit_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "sakhi_id" TEXT NOT NULL,
    "local_visit_uuid" VARCHAR(80) NOT NULL,
    "actual_visit_date" DATE,
    "status" "VisitInstanceStatus" NOT NULL,
    "meet_beneficiary_flag" BOOLEAN,
    "not_met_reason" VARCHAR(255),
    "completed_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "visit_instances_pkey" PRIMARY KEY ("visit_id")
);

-- CreateTable
CREATE TABLE "visit_status_history" (
    "visit_status_history_id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "from_status" "VisitInstanceStatus",
    "to_status" "VisitInstanceStatus" NOT NULL,
    "reason_code" VARCHAR(80),
    "changed_by_user_id" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "visit_status_history_pkey" PRIMARY KEY ("visit_status_history_id")
);

-- CreateTable
CREATE TABLE "form_definitions" (
    "form_definition_id" TEXT NOT NULL,
    "form_code" VARCHAR(60) NOT NULL,
    "form_name" VARCHAR(80) NOT NULL,
    "entity_type" "FormEntityType" NOT NULL,
    "status" "FormDefinitionStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "form_definitions_pkey" PRIMARY KEY ("form_definition_id")
);

-- CreateTable
CREATE TABLE "form_versions" (
    "form_version_id" TEXT NOT NULL,
    "form_definition_id" TEXT NOT NULL,
    "version_no" VARCHAR(40) NOT NULL,
    "schema_json" JSONB NOT NULL,
    "validation_json" JSONB,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "published_by_user_id" TEXT,
    "status" "FormVersionStatus" NOT NULL,
    "checksum" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "form_versions_pkey" PRIMARY KEY ("form_version_id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "submission_id" TEXT NOT NULL,
    "form_version_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "visit_id" TEXT,
    "submitted_by_user_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL,
    "local_submission_uuid" VARCHAR(80) NOT NULL,
    "form_data_json" JSONB NOT NULL,
    "validation_status" "FormValidationStatus" NOT NULL,
    "rule_version_id" TEXT,
    "sync_batch_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("submission_id")
);

-- CreateTable
CREATE TABLE "form_answers" (
    "answer_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "field_code" VARCHAR(120) NOT NULL,
    "answer_value_text" TEXT,
    "answer_value_number" DECIMAL(18,4),
    "answer_value_date" DATE,
    "answer_value_bool" BOOLEAN,
    "answer_value_json" JSONB,
    "is_indexed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "form_answers_pkey" PRIMARY KEY ("answer_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_instances_local_visit_uuid_key" ON "visit_instances"("local_visit_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "form_definitions_form_code_key" ON "form_definitions"("form_code");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_form_definition_id_version_no_key" ON "form_versions"("form_definition_id", "version_no");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_local_submission_uuid_key" ON "form_submissions"("local_submission_uuid");

-- AddForeignKey
ALTER TABLE "visit_instances" ADD CONSTRAINT "visit_instances_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "visit_schedules"("schedule_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_status_history" ADD CONSTRAINT "visit_status_history_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit_instances"("visit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_form_definition_id_fkey" FOREIGN KEY ("form_definition_id") REFERENCES "form_definitions"("form_definition_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "form_versions"("form_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visit_instances"("visit_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_answers" ADD CONSTRAINT "form_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("submission_id") ON DELETE RESTRICT ON UPDATE CASCADE;

