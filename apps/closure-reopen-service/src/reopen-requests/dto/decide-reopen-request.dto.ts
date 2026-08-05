import { z } from 'zod';

/**
 * Validation schema for a Supervisor's decision on a reopen request
 * (Quick Response's REOPEN card, FR pending confirmation). `.strict()`
 * rejects unknown fields, matching this repo's global convention.
 */
export const decideReopenRequestSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    decisionReasonCodeLookupId: z.string().uuid().optional(),
    decisionNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type DecideReopenRequestInput = z.infer<typeof decideReopenRequestSchema>;
