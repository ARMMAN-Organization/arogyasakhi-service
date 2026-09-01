-- AlterTable
ALTER TABLE "escalation_events" ALTER COLUMN "beneficiary_id" DROP NOT NULL;
ALTER TABLE "escalation_events" ADD COLUMN "sakhi_user_id" TEXT;
