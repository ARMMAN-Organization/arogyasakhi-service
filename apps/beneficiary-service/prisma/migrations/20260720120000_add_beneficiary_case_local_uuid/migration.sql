-- AlterTable: add nullable first so existing rows aren't rejected, backfill
-- with their own beneficiary_id (guaranteed unique) as a placeholder, then
-- enforce NOT NULL. New rows always supply a real client-generated value.
ALTER TABLE "beneficiary_cases" ADD COLUMN "local_case_uuid" VARCHAR(80);

UPDATE "beneficiary_cases" SET "local_case_uuid" = "beneficiary_id" WHERE "local_case_uuid" IS NULL;

ALTER TABLE "beneficiary_cases" ALTER COLUMN "local_case_uuid" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "beneficiary_cases_local_case_uuid_key" ON "beneficiary_cases"("local_case_uuid");
