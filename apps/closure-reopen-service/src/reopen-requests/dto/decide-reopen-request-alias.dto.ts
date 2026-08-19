import { z } from 'zod';

/**
 * Validation schema for the Supervisor app's POST decision alias
 * (POST /reopen-requests/:id/decision), which uses APPROVE/REJECT vocabulary
 * instead of the PATCH endpoint's APPROVED/REJECTED — translated in the
 * controller before delegating to the existing `ReopenRequestService.decide`.
 * `.strict()` rejects unknown fields, matching this repo's global convention.
 */
export const decideReopenRequestAliasSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    decisionReasonCodeLookupId: z.string().uuid().optional(),
    decisionNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type DecideReopenRequestAliasInput = z.infer<typeof decideReopenRequestAliasSchema>;
