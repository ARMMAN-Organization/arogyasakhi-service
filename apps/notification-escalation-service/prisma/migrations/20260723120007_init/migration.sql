-- CreateEnum
CREATE TYPE "EscalationType" AS ENUM ('ANC_2_MISSED', 'ANC_HR_MISSED', 'PP_MISSED', 'PP_HR_MISSED', 'NN_MISSED', 'NN_HR_MISSED', 'INC_2_MISSED', 'INC_HR_MISSED', 'CCV_MISSED', 'CCV_HR_MISSED', 'POST_EDD_MISSED', 'DELIVERY_FORM_PENDING', 'REFERRAL_FOLLOWUP_MISSED', 'REFERRAL_INCOMPLETE', 'TRANSFER_PENDING', 'TRANSFER_APPROVAL_PENDING', 'SYNC_DELAY', 'CLOSURE_PENDING', 'REOPEN_PENDING');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'TRANSFER_REQUESTED', 'CLOSE_REQUESTED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MISSED_VISIT_ESCALATION', 'REFERRAL_UPDATE', 'REFERRAL_FOLLOWUP_DUE', 'REFERRAL_FOLLOWUP_OVERDUE', 'REOPEN_UPDATE', 'CLOSURE_UPDATE', 'LMP_CHANGE_UPDATE', 'FORM_UPDATE', 'DATA_SYNC_STATUS', 'VISIT_NEAR_MISS', 'EDD_APPROACHING', 'EDD_OVERDUE', 'SUPERVISOR_APPROVAL_REQUESTED', 'SUPERVISOR_APPROVAL_DECISION', 'APP_UPDATE_REQUIRED', 'MEETING_REMINDER', 'TRAINING_REMINDER', 'MEETING_UPDATE', 'TRAINING_UPDATE');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "escalation_events" (
    "escalation_id" TEXT NOT NULL,
    "beneficiary_id" TEXT NOT NULL,
    "visit_id" TEXT,
    "referral_id" TEXT,
    "escalation_type" "EscalationType" NOT NULL,
    "trigger_rule_version_id" TEXT,
    "status" "EscalationStatus" NOT NULL,
    "assigned_supervisor_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "action_taken" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "escalation_events_pkey" PRIMARY KEY ("escalation_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "cta_type" VARCHAR(80),
    "linked_entity_type" VARCHAR(80),
    "linked_entity_id" TEXT,
    "status" "NotificationStatus" NOT NULL,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

