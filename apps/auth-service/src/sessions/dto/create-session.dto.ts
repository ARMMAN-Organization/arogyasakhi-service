import { z } from 'zod';

/**
 * Validation schema for creating a session. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createSessionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
