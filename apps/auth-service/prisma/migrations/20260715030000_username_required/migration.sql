-- Backfill: any row created before the username column existed (migration
-- 20260715000000_add_username) has username = NULL. Fall back to
-- mobile_number with the leading "+" stripped ("+919876543210" ->
-- "9198765543210") so the backfilled value actually satisfies usernameSchema
-- (/^[a-zA-Z0-9._-]+$/, no "+" allowed) and can be used to log in — a bare
-- copy of mobile_number would pass this NOT NULL constraint but produce a
-- username no one could ever authenticate with. mobile_number is NOT NULL
-- UNIQUE, so the stripped value can still never collide with the unique
-- index on username.
UPDATE "users" SET "username" = REPLACE("mobile_number", '+', '') WHERE "username" IS NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
