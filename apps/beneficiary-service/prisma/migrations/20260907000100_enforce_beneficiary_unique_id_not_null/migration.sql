-- Phase 2 of 2 for the SRS "Unique ID" field: run ONLY after the backfill
-- script (prisma/scripts/backfill-unique-id.ts) has populated unique_id for
-- every pre-existing beneficiary_cases row. Applying this migration before
-- the backfill completes will fail (NOT NULL violation on rows still null).

ALTER TABLE "beneficiary_cases" ALTER COLUMN "unique_id" SET NOT NULL;
ALTER TABLE "beneficiary_cases" ADD CONSTRAINT "beneficiary_cases_unique_id_key" UNIQUE ("unique_id");
