import { z } from 'zod';

/**
 * Validation schema for creating a visit instance. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createVisitInstanceSchema = z
  .object({
    scheduleId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    sakhiId: z.string().uuid(),
    localVisitUuid: z.string().trim().min(1).max(80),
    status: z.enum(['STARTED', 'PENDING', 'MISSED', 'COMPLETED', 'DISCARDED']),
    actualVisitDate: z.coerce.date().optional(),
    meetBeneficiaryFlag: z.boolean().optional(),
    notMetReason: z.string().trim().min(1).max(255).optional(),
    completedAt: z.coerce.date().optional(),
    syncedAt: z.coerce.date().optional(),
  })
  .strict();

export type CreateVisitInstanceInput = z.infer<typeof createVisitInstanceSchema>;
