import { z } from 'zod';

/**
 * Validation schema for creating a notification. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createNotificationSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
