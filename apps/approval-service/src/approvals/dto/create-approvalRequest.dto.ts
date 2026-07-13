import { z } from 'zod';

/**
 * Validation schema for creating an approval request. `.strict()` rejects
 * unknown fields, matching the previous global ValidationPipe
 * `forbidNonWhitelisted: true`.
 */
export const createApprovalRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateApprovalRequestInput = z.infer<typeof createApprovalRequestSchema>;
