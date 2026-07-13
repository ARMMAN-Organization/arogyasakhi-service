import { z } from 'zod';

/**
 * Validation schema for creating a sync batch. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createSyncBatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateSyncBatchInput = z.infer<typeof createSyncBatchSchema>;
