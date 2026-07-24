-- Drops three redundant supervisor-decision columns from reopen_requests.
-- These duplicated the decided_by_user_id / decision_reason_code_lookup_id /
-- decision_notes columns that already exist on the same table (see the ERD
-- doc's resolution of this duplicate-column pair, issue #31). No application
-- code references these columns (the ReopenRequest model has no service/
-- controller/DTO layer yet), and there is no seed data, so the drop is safe.

ALTER TABLE "reopen_requests" DROP COLUMN "supervisor_id";
ALTER TABLE "reopen_requests" DROP COLUMN "supervisor_rejection_reason_code_lookup_id";
ALTER TABLE "reopen_requests" DROP COLUMN "supervisor_rejection_notes";
