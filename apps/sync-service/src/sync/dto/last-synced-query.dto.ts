import { z } from 'zod';

/** Query params for `GET /sync/last-synced`. */
export const lastSyncedQuerySchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();

export type LastSyncedQueryInput = z.infer<typeof lastSyncedQuerySchema>;
