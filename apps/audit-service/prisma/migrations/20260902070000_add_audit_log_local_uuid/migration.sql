-- AlterTable: add local_audit_uuid as a nullable idempotency key for
-- POST /audit, for mobile-originated, offline-first callers (e.g. a Sakhi's
-- LMP change / form answer edit decision synced with retries). Every other
-- audit_log row (ADMIN, or SUPERVISOR's QUICK_RESPONSE_* forwarding) has no
-- client-generated key of its own, so this column stays nullable — a plain
-- UNIQUE index on a nullable column already allows unlimited NULLs and
-- enforces uniqueness only among non-null values.
ALTER TABLE "audit_log" ADD COLUMN "local_audit_uuid" VARCHAR(80);

CREATE UNIQUE INDEX "audit_log_local_audit_uuid_key" ON "audit_log"("local_audit_uuid");
