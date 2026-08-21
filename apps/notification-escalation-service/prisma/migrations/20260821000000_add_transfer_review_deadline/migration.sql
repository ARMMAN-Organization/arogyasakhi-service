-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BENEFICIARY_TRANSFER_NOTICE';

-- AlterTable
-- TRANSFER_REQUESTED only (FR-SV-4.3) — the Manager's review deadline,
-- stamped at decision time as now + 15 days. Null for every other status.
ALTER TABLE "escalation_events" ADD COLUMN "review_deadline_at" TIMESTAMP(3);
