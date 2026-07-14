import { z } from 'zod';

/**
 * Validation schema for creating a session. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createSessionSchema = z
  .object({
    userId: z.string().uuid(),
    refreshTokenHash: z.string().trim().min(1).max(255),
    deviceId: z.string().uuid().optional(),
    issuedAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    revokedAt: z.coerce.date().optional(),
    ipAddress: z.string().trim().min(1).max(45).optional(),
  })
  .strict();

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
