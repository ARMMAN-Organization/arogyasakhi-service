import { z } from 'zod';

/**
 * Validation schema for creating a beneficiary case. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createBeneficiarySchema = z
  .object({
    caseType: z.enum(['MOTHER', 'CHILD']),
    name: z.string().trim().min(1).max(120),
    projectId: z.string().uuid(),
  })
  .strict();

export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;
