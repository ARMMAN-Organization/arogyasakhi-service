-- AlterEnum
-- LMP_CHANGE card evidence (Supervisor app's card detail screen). ALTER TYPE
-- ... ADD VALUE cannot run inside the same transaction as other statements
-- that use the new value, but this migration only adds the value (no data
-- backfill references it), so a single statement is safe here.
ALTER TYPE "MediaAssetType" ADD VALUE 'LMP_SONOGRAPHY_REPORT';
