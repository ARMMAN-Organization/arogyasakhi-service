-- ERD §6 "Required Indexes and Constraints" — Care journey row requires
-- index form_submissions(beneficiary_id, form_definition_id, submitted_at).
-- form_submissions' actual FK is form_version_id (per this table's own
-- Appendix A definition, not form_definition_id), so this indexes the
-- column that actually exists.
CREATE INDEX "form_submissions_beneficiary_id_form_version_id_submitted_a_idx" ON "form_submissions"("beneficiary_id", "form_version_id", "submitted_at");
