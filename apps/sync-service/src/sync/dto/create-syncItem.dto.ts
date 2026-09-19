import { z } from 'zod';

/** Mirrors the `SyncOperation` enum in the Prisma schema. */
const syncOperationSchema = z.enum(['CREATE', 'UPDATE', 'DELETE', 'UPSERT']);

/**
 * Mirrors the `SyncItemStatus` enum in the Prisma schema. Only the
 * mobile-reportable outcomes — `DUPLICATE` (this item's `localEntityUuid` +
 * `entityType` already synced SUCCESSfully) is computed server-side in
 * syncItem.repository.ts, never accepted from the caller, since a client
 * has no reliable way to know that ahead of the dedupe check.
 */
const syncItemStatusSchema = z.enum(['QUEUED', 'SUCCESS', 'FAILED', 'SKIPPED', 'PARTIAL']);

const syncItemSchema = z
  .object({
    syncBatchId: z.string().uuid(),
    localEntityUuid: z.string().trim().min(1).max(80),
    entityType: z.string().trim().min(1).max(80),
    entityId: z.string().optional(),
    operation: syncOperationSchema,
    status: syncItemStatusSchema,
    errorCode: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

/**
 * Validation schema for reporting sync items (SRS §8.4: "every synced
 * entity/form/media item shall create a sync_items record"). Accepts a
 * bulk array — a Sakhi's sync cycle typically uploads many entities per
 * batch, and reporting them one HTTP call at a time would be needlessly
 * chatty on a rural/low-bandwidth connection.
 */
export const createSyncItemsSchema = z
  .object({
    items: z.array(syncItemSchema).min(1).max(500),
  })
  .strict();

export type CreateSyncItemInput = z.infer<typeof syncItemSchema>;
export type CreateSyncItemsInput = z.infer<typeof createSyncItemsSchema>;
