-- Add a durable group identifier to inventory_transactions so rows created
-- from one submission (or appended to it later) can be reliably grouped,
-- replacing the previous same-millisecond createdAt heuristic.

-- 1. Add as nullable first so existing rows aren't rejected.
ALTER TABLE "inventory_transactions" ADD COLUMN "group_id" TEXT;

-- 2. Backfill existing rows to their own id, so pre-migration data reads as
--    one-row groups with zero behavior change.
UPDATE "inventory_transactions" SET "group_id" = "inventory_txn_id" WHERE "group_id" IS NULL;

-- 3. Enforce NOT NULL now that every row has a value.
ALTER TABLE "inventory_transactions" ALTER COLUMN "group_id" SET NOT NULL;

-- 4. Index to support "all rows in a group" and "a sakhi's groups" lookups.
CREATE INDEX "inventory_transactions_sakhi_id_group_id_idx" ON "inventory_transactions"("sakhi_id", "group_id");
