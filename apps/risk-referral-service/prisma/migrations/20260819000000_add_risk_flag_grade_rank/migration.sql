-- AlterTable
-- Add as nullable first, backfill existing rows to 0 (treated as NORMAL,
-- the safest default for historic flags whose true grade rank was never
-- recorded), then enforce NOT NULL — avoids failing on any pre-existing
-- risk_flags rows.
ALTER TABLE "risk_flags" ADD COLUMN "grade_rank" INTEGER;

UPDATE "risk_flags" SET "grade_rank" = 0 WHERE "grade_rank" IS NULL;

ALTER TABLE "risk_flags" ALTER COLUMN "grade_rank" SET NOT NULL;
