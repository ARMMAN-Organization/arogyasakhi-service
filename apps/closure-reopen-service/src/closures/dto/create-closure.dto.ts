import { z } from 'zod';

/**
 * Validation schema for creating a closure. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createClosureSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    closureType: z.enum(['MEDICAL', 'NON_MEDICAL', 'PROGRAM_COMPLETION']),
    closureReason: z.enum([
      'MISCARRIAGE',
      'ABORTION',
      'MATERNAL_DEATH',
      'INFANT_OR_CHILD_DEATH',
      'MIGRATION',
      'WITHDRAWAL',
      'PROGRAM_CYCLE_COMPLETED',
      'OTHER',
    ]),
    eventDate: z.coerce.date().optional(),
    closureDate: z.coerce.date(),
    submittedByUserId: z.string().uuid(),
    supervisorStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    supervisorId: z.string().uuid().optional(),
    supervisorNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type CreateClosureInput = z.infer<typeof createClosureSchema>;
