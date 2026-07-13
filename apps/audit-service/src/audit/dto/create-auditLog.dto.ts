import { z } from 'zod';

/**
 * Validation schema for creating an audit log entry. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createAuditLogSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict();

export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>;
