-- AlterTable
ALTER TABLE "Beneficiary_risk_condition_summary" ADD COLUMN "is_first_instance" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Beneficiary_risk_condition_summary" ADD COLUMN "consecutive_no_improvement_count" INTEGER;
