-- Fix the composite (sakhi_id, group_id) index added in
-- 20260915090000_add_inventory_transaction_group_id: it doesn't serve either
-- of the two real access patterns as a leading-column lookup.
-- findInventoryTransactionGroupHeader (the hot path on every append, and on
-- every group lookup) filters on group_id alone, with no sakhi_id
-- predicate. findInventoryTransactionsBySakhi filters on sakhi_id alone.
-- Since neither query filters on both columns together, two single-column
-- indexes serve both patterns; the composite index only would have served
-- one leading-column pattern (sakhi_id) that nothing here actually queries by.
DROP INDEX "inventory_transactions_sakhi_id_group_id_idx";

CREATE INDEX "inventory_transactions_group_id_idx" ON "inventory_transactions"("group_id");
CREATE INDEX "inventory_transactions_sakhi_id_idx" ON "inventory_transactions"("sakhi_id");
