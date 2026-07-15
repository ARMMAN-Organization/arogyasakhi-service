-- Backfill: any row created before the username column existed (migration
-- 20260715000000_add_username) has username = NULL. Fall back to
-- mobile_number, which is itself NOT NULL UNIQUE, so this can never collide
-- with the unique index on username and always satisfies the NOT NULL
-- constraint added below.
UPDATE "users" SET "username" = "mobile_number" WHERE "username" IS NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
