-- CreateIndex
CREATE INDEX "risk_assessments_beneficiary_id_is_deleted_idx" ON "risk_assessments"("beneficiary_id", "is_deleted");

-- CreateIndex
CREATE INDEX "risk_state_snapshots_beneficiary_id_is_deleted_idx" ON "risk_state_snapshots"("beneficiary_id", "is_deleted");
