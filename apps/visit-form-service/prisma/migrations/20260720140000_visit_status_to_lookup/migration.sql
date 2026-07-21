-- Replaces the VisitInstanceStatus Postgres enum (STARTED/PENDING/MISSED/
-- COMPLETED/DISCARDED) with a lookup-value-id reference (category VISIT_STATUS,
-- owned by auth-service's lookup_categories/lookup_values).
--
-- Transitional design (per PR #58 review): rather than writing the old enum
-- value into the *_lookup_value_id column (which would leave non-UUID codes in
-- a column that everything else treats as a UUID), each pre-existing row's enum
-- value is preserved in a nullable *_status_code column. The *_lookup_value_id
-- column is added NULLABLE. An application-level backfill (prisma/
-- backfill-visit-status-lookup.ts) resolves each status_code to its
-- VISIT_STATUS lookup row's UUID via auth-service — NOT a cross-schema SQL join,
-- per the forklift rule (services may live in separate databases). A later
-- migration enforces NOT NULL on *_lookup_value_id once every row is backfilled.
--
-- New rows written after this migration set *_lookup_value_id directly (the API
-- already supplies a real UUID) and leave *_status_code NULL — it exists only to
-- carry legacy enum values through the backfill.

-- AlterTable: visit_instances.status (VisitInstanceStatus) -> status_code + status_lookup_value_id
ALTER TABLE "visit_instances" ADD COLUMN "status_code" TEXT;
ALTER TABLE "visit_instances" ADD COLUMN "status_lookup_value_id" TEXT;
UPDATE "visit_instances" SET "status_code" = "status"::text WHERE "status_code" IS NULL;
ALTER TABLE "visit_instances" DROP COLUMN "status";

-- AlterTable: visit_status_history.from_status / to_status
ALTER TABLE "visit_status_history" ADD COLUMN "from_status_code" TEXT;
ALTER TABLE "visit_status_history" ADD COLUMN "from_status_lookup_value_id" TEXT;
ALTER TABLE "visit_status_history" ADD COLUMN "to_status_code" TEXT;
ALTER TABLE "visit_status_history" ADD COLUMN "to_status_lookup_value_id" TEXT;
UPDATE "visit_status_history" SET "from_status_code" = "from_status"::text WHERE "from_status_code" IS NULL AND "from_status" IS NOT NULL;
UPDATE "visit_status_history" SET "to_status_code" = "to_status"::text WHERE "to_status_code" IS NULL AND "to_status" IS NOT NULL;
ALTER TABLE "visit_status_history" DROP COLUMN "from_status";
ALTER TABLE "visit_status_history" DROP COLUMN "to_status";

-- DropEnum
DROP TYPE "VisitInstanceStatus";
