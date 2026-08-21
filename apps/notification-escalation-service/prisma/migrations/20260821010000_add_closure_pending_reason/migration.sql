-- AlterTable
-- CLOSURE_PENDING only (POST /escalations/:id/closure-pending-reason) — why the
-- closure form hasn't been submitted yet. Distinct from action_taken, which
-- records a decision outcome (CLOSE/TRANSFER), not a still-pending explanation.
ALTER TABLE "escalation_events" ADD COLUMN "pending_reason_lookup_value_id" TEXT;
ALTER TABLE "escalation_events" ADD COLUMN "pending_reason_notes" VARCHAR(500);
ALTER TABLE "escalation_events" ADD COLUMN "pending_reason_submitted_at" TIMESTAMP(3);
