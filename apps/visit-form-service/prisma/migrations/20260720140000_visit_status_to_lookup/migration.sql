-- Replaces the VisitInstanceStatus Postgres enum (STARTED/PENDING/MISSED/
-- COMPLETED/DISCARDED) with a lookup-value-id scalar (category VISIT_STATUS,
-- owned by auth-service's lookup_categories/lookup_values). Not backfilled
-- via a cross-schema SQL join here — visit-form-service and auth-service may
-- live in entirely separate databases per the forklift rule, so any existing
-- row's status must be backfilled by application code (matching the old
-- enum value string to the VISIT_STATUS lookup row with the same
-- value_code) rather than a join baked into this migration.

-- AlterTable: visit_instances.status (VisitInstanceStatus) -> status_lookup_value_id (TEXT)
ALTER TABLE "visit_instances" ADD COLUMN "status_lookup_value_id" TEXT;
UPDATE "visit_instances" SET "status_lookup_value_id" = "status"::text WHERE "status_lookup_value_id" IS NULL;
ALTER TABLE "visit_instances" ALTER COLUMN "status_lookup_value_id" SET NOT NULL;
ALTER TABLE "visit_instances" DROP COLUMN "status";

-- AlterTable: visit_status_history.from_status / to_status
ALTER TABLE "visit_status_history" ADD COLUMN "from_status_lookup_value_id" TEXT;
ALTER TABLE "visit_status_history" ADD COLUMN "to_status_lookup_value_id" TEXT;
UPDATE "visit_status_history" SET "from_status_lookup_value_id" = "from_status"::text WHERE "from_status_lookup_value_id" IS NULL;
UPDATE "visit_status_history" SET "to_status_lookup_value_id" = "to_status"::text WHERE "to_status_lookup_value_id" IS NULL AND "to_status" IS NOT NULL;
ALTER TABLE "visit_status_history" ALTER COLUMN "to_status_lookup_value_id" SET NOT NULL;
ALTER TABLE "visit_status_history" DROP COLUMN "from_status";
ALTER TABLE "visit_status_history" DROP COLUMN "to_status";

-- DropEnum
DROP TYPE "VisitInstanceStatus";
