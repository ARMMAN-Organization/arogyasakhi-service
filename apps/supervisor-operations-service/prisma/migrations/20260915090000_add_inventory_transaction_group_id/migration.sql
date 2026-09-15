-- Add a durable group identifier to inventory_transactions so rows created
-- from one submission (or appended to it later) can be reliably grouped,
-- replacing the previous same-millisecond createdAt heuristic.

-- 1. Add as nullable first so existing rows aren't rejected.
ALTER TABLE "inventory_transactions" ADD COLUMN "group_id" TEXT;

-- 2. Backfill every existing row to its own id. Deliberately NOT
--    reconstructing pre-migration multi-item groups from the old
--    same-millisecond createdAt heuristic here — that heuristic was never
--    guaranteed exact (each row's createdAt is its own now() call), so
--    re-deriving groups from it risks silently merging unrelated rows or
--    missing real ones. Existing multi-item submissions therefore read as N
--    separate one-row groups after this migration and can no longer be
--    appended to as a group — only new submissions get real, durable
--    groupIds going forward.
UPDATE "inventory_transactions" SET "group_id" = "inventory_txn_id";

-- 3. Enforce NOT NULL now that every row has a value.
ALTER TABLE "inventory_transactions" ALTER COLUMN "group_id" SET NOT NULL;

-- 4. Index to support "all rows in a group" and "a sakhi's groups" lookups.
CREATE INDEX "inventory_transactions_sakhi_id_group_id_idx" ON "inventory_transactions"("sakhi_id", "group_id");
