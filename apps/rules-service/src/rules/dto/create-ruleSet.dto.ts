import { z } from 'zod';

/**
 * Validation schema for creating a rule set. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createRuleSetSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateRuleSetInput = z.infer<typeof createRuleSetSchema>;
