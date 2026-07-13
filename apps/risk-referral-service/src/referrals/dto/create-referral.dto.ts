import { z } from 'zod';

/**
 * Validation schema for creating a referral. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createReferralSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateReferralInput = z.infer<typeof createReferralSchema>;
