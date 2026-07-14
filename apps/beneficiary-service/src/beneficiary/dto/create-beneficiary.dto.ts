import { z } from 'zod';

/**
 * Validation schema for creating a beneficiary case. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createBeneficiarySchema = z
  .object({
    piiId: z.string().uuid(),
    projectId: z.string().uuid(),
    caseType: z.enum(['MOTHER', 'CHILD']),
    pregnancySequenceNo: z.number().int().optional(),
    previousBeneficiaryId: z.string().uuid().optional(),
    motherBeneficiaryId: z.string().uuid().optional(),
    sakhiId: z.string().uuid(),
    registrationDate: z.coerce.date(),
    currentStatus: z
      .enum(['ACTIVE', 'JOURNEY_COMPLETE', 'CLOSED', 'TRANSFERRED', 'REOPEN_REQUESTED'])
      .default('ACTIVE'),
    currentPhase: z.enum(['ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV', 'CLOSED']),
    beneficiaryTypeLookupId: z.string().uuid(),
    caseTypeLookupId: z.string().uuid(),
    journeyStartDate: z.coerce.date(),
    journeyEndDate: z.coerce.date().optional(),
  })
  .strict();

export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;
