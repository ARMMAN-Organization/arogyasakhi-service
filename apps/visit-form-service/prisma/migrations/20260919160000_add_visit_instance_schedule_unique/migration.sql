-- Enforces "at most one non-deleted VisitInstance per scheduleId" — closes
-- the gap where a retry with a fresh local_visit_uuid (but the same
-- schedule) created a duplicate row instead of being recognized as the same
-- visit. Partial (WHERE is_deleted = false) so a DISCARDED/soft-deleted
-- instance frees the schedule for a new attempt.
--
-- IMPORTANT: run the companion cleanup script
-- (apps/visit-form-service/scripts/cleanup-duplicate-visit-instances.ts)
-- against every environment BEFORE applying this migration — it will fail
-- if any scheduleId still has more than one non-deleted VisitInstance row.

-- CreateIndex
CREATE UNIQUE INDEX "visit_instances_schedule_id_key" ON "visit_instances"("schedule_id") WHERE "is_deleted" = false;
