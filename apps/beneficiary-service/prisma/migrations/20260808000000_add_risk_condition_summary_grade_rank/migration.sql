-- AlterTable
ALTER TABLE "Beneficiary_risk_condition_summary" ADD COLUMN "latest_grade_rank" INTEGER;
ALTER TABLE "Beneficiary_risk_condition_summary" ADD COLUMN "ever_highest_grade_rank" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_risk_condition_summary_beneficiary_id_risk_condition_id_key" ON "Beneficiary_risk_condition_summary"("beneficiary_id", "risk_condition_id");
