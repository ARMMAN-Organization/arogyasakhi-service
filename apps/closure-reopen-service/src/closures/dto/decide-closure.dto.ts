import { z } from 'zod';

/**
 * Validation schema for a Supervisor's decision on a pending closure review
 * (FR-SV-4.4). `.strict()` rejects unknown fields, matching this repo's
 * global convention.
 */
export const decideClosureSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    supervisorNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type DecideClosureInput = z.infer<typeof decideClosureSchema>;
