import { z } from 'zod';

/**
 * Validation schema for creating a media asset. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createMediaAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateMediaAssetInput = z.infer<typeof createMediaAssetSchema>;
