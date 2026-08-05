-- AlterTable
-- Added nullable first, then backfilled and tightened — visit_schedules has
-- no write path anywhere in the codebase yet (no POST /visit-schedules
-- endpoint exists before this change), so every environment's table is
-- expected to be empty; the backfill is a formality for that expectation,
-- not a real data migration.
ALTER TABLE "visit_schedules" ADD COLUMN "local_schedule_uuid" VARCHAR(80);

UPDATE "visit_schedules" SET "local_schedule_uuid" = "schedule_id"::text WHERE "local_schedule_uuid" IS NULL;

ALTER TABLE "visit_schedules" ALTER COLUMN "local_schedule_uuid" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "visit_schedules_local_schedule_uuid_key" ON "visit_schedules"("local_schedule_uuid");

-- CreateIndex
CREATE INDEX "visit_schedules_beneficiary_id_status_idx" ON "visit_schedules"("beneficiary_id", "status") WHERE "is_deleted" = false;

-- CreateIndex
CREATE INDEX "visit_schedules_scheduled_date_idx" ON "visit_schedules"("scheduled_date") WHERE "is_deleted" = false;
