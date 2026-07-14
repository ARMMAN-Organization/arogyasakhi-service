import { z } from 'zod';

/**
 * Validation schema for creating an incentive event. `.strict()` rejects
 * unknown fields, matching the previous global ValidationPipe
 * `forbidNonWhitelisted: true`.
 */
export const createIncentiveEventSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateIncentiveEventInput = z.infer<typeof createIncentiveEventSchema>;
