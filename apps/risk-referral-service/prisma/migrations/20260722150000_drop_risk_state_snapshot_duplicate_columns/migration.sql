-- Drops the baseline/latest/ever-at-risk tracking columns from
-- risk_state_snapshots. These duplicated the per-condition tracking that is
-- the sole source of truth in beneficiary-service's
-- beneficiary_risk_condition_summary (see the ERD doc's resolution of this
-- duplicate-model overlap, issue #28). risk_state_snapshots now tracks only
-- ccv_state, which has no equivalent elsewhere. No application code references
-- these columns (the RiskStateSnapshot model has no service/controller/DTO
-- layer yet), and there is no seed data, so the drop is safe.

ALTER TABLE "risk_state_snapshots" DROP COLUMN "baseline_risk_json";
ALTER TABLE "risk_state_snapshots" DROP COLUMN "latest_risk_json";
ALTER TABLE "risk_state_snapshots" DROP COLUMN "ever_at_risk_json";
ALTER TABLE "risk_state_snapshots" DROP COLUMN "source_visit_id";
