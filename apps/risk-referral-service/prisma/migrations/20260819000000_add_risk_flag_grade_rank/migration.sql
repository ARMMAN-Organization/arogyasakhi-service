-- AlterTable
-- Add as nullable first, backfill existing rows to 0 (treated as NORMAL —
-- NOT necessarily each row's true historic grade, only a placeholder that
-- lets NOT NULL be enforced below without failing on pre-existing rows),
-- then enforce NOT NULL.
--
-- IMPORTANT: on any environment where risk_flags already had real
-- MILD/MODERATE/SEVERE rows before this migration ran, the 0 default below
-- is WRONG for those rows and must be corrected — see
-- prisma/backfill-grade-rank-from-lookup.ts, which re-derives each row's
-- true grade_rank from its riskGradeLookupValueId via auth-service's
-- RISK_GRADE lookup (see PR #172 review). Run that script once after
-- deploying this migration on any such environment. A no-op on an
-- environment where risk_flags was empty when this migration ran.
ALTER TABLE "risk_flags" ADD COLUMN "grade_rank" INTEGER;

UPDATE "risk_flags" SET "grade_rank" = 0 WHERE "grade_rank" IS NULL;

ALTER TABLE "risk_flags" ALTER COLUMN "grade_rank" SET NOT NULL;
