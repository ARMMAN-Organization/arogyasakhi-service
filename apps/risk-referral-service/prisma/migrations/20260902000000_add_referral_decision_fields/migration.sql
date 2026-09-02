-- AlterTable
ALTER TABLE "referrals" ADD COLUMN "decided_by_user_id" TEXT,
ADD COLUMN "decided_at" TIMESTAMP(3),
ADD COLUMN "decision_notes" TEXT;
