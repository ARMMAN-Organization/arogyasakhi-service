-- AlterTable: add local_closure_uuid as nullable first so any existing rows
-- don't violate NOT NULL, backfill them with a generated value, then add the
-- NOT NULL + UNIQUE constraints.
ALTER TABLE "closures" ADD COLUMN "local_closure_uuid" VARCHAR(80);

UPDATE "closures" SET "local_closure_uuid" = gen_random_uuid()::text WHERE "local_closure_uuid" IS NULL;

ALTER TABLE "closures" ALTER COLUMN "local_closure_uuid" SET NOT NULL;

CREATE UNIQUE INDEX "closures_local_closure_uuid_key" ON "closures"("local_closure_uuid");
