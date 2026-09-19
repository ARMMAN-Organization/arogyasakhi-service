-- AlterEnum
ALTER TYPE "SyncItemStatus" ADD VALUE 'DUPLICATE';
ALTER TYPE "SyncItemStatus" ADD VALUE 'PARTIAL';

-- CreateIndex
CREATE INDEX "sync_items_local_entity_uuid_entity_type_status_idx" ON "sync_items"("local_entity_uuid", "entity_type", "status");
