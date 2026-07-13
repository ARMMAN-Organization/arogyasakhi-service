import { z } from 'zod';

/**
 * Validation schema for creating a closure. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createClosureSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateClosureInput = z.infer<typeof createClosureSchema>;
