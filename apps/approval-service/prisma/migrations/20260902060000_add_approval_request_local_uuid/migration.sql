-- AlterTable: add local_request_uuid as a nullable idempotency key for
-- POST /lmp-change-requests. Unlike reopen_requests' local_reopen_request_uuid
-- (later made NOT NULL with a backfill), every other approval_requests row
-- (created via the generic POST /approvals, or REOPEN/CLOSURE_REVIEW's own
-- dedicated create endpoints) has no client-generated key of its own, so this
-- column stays nullable — a plain UNIQUE index on a nullable column already
-- allows unlimited NULLs and enforces uniqueness only among non-null values.
ALTER TABLE "approval_requests" ADD COLUMN "local_request_uuid" VARCHAR(80);

CREATE UNIQUE INDEX "approval_requests_local_request_uuid_key" ON "approval_requests"("local_request_uuid");
