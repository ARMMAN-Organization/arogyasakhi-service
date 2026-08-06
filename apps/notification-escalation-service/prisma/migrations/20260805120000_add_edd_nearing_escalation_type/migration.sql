-- AlterEnum
-- Quick Response's EDD_NEARING card type — distinct from POST_EDD_MISSED
-- (the EDD has already passed); this fires while it's still approaching.
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as other
-- statements that use the new value, but this migration only adds the value
-- (no data backfill references it), so a single statement is safe here.
ALTER TYPE "EscalationType" ADD VALUE 'EDD_NEARING';
