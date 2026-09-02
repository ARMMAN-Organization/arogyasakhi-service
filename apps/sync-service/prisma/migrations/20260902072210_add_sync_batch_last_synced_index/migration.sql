-- CreateIndex
CREATE INDEX "sync_batches_user_id_status_completed_at_idx" ON "sync_batches"("user_id", "status", "completed_at");
