-- AlterTable
-- Missed Visit Escalation detail's visitsMissedCount — no confirmed data
-- source yet, so this is nullable until an upstream process starts writing it.
ALTER TABLE "escalation_events" ADD COLUMN "visits_missed_count" INTEGER;
