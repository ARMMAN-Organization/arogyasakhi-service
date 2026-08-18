import { z } from 'zod';

/**
 * Query params for `GET /sync/pending`. `userId` is optional — omitting it
 * defaults to the authenticated caller's own id (see
 * `syncPending.service.ts`'s `listPending`), which is how a Sakhi's own
 * mobile app checks its own outstanding uploads without needing to know its
 * own `userId` up front. `.strict()` rejects unknown query params.
 */
export const syncPendingQuerySchema = z
  .object({
    userId: z.string().uuid().optional(),
  })
  .strict();

export type SyncPendingQuery = z.infer<typeof syncPendingQuerySchema>;
