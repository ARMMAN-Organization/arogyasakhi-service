import { z } from 'zod';

/**
 * Validation schema for POST /missed-visit-escalations/:id/decision.
 * Missed Visit Escalation isn't an Approve/Reject flow — TRANSFER emails
 * the beneficiary's Manager and removes her from the Sakhi's list; CLOSE
 * notifies the Sakhi to fill the closure form. `.strict()` rejects unknown
 * fields, matching this repo's global convention.
 */
export const decideMissedVisitEscalationSchema = z
  .object({
    action: z.enum(['TRANSFER', 'CLOSE']),
  })
  .strict();

export type DecideMissedVisitEscalationInput = z.infer<typeof decideMissedVisitEscalationSchema>;
