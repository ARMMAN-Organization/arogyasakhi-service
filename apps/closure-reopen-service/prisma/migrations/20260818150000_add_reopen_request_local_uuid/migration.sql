-- AlterTable: add local_reopen_request_uuid as nullable first so any
-- existing rows don't violate NOT NULL, backfill them with a generated
-- value, then add the NOT NULL + UNIQUE constraints.
ALTER TABLE "reopen_requests" ADD COLUMN "local_reopen_request_uuid" VARCHAR(80);

UPDATE "reopen_requests" SET "local_reopen_request_uuid" = gen_random_uuid()::text WHERE "local_reopen_request_uuid" IS NULL;

ALTER TABLE "reopen_requests" ALTER COLUMN "local_reopen_request_uuid" SET NOT NULL;

CREATE UNIQUE INDEX "reopen_requests_local_reopen_request_uuid_key" ON "reopen_requests"("local_reopen_request_uuid");
