import { z } from 'zod';

/**
 * Validation schema for creating a visit instance. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createVisitInstanceSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateVisitInstanceInput = z.infer<typeof createVisitInstanceSchema>;
