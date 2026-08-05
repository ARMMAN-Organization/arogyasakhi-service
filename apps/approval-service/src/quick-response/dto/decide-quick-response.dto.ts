import { z } from 'zod';

/**
 * Validation schema for POST /quick-response/:cardId/decision. `decision`
 * is a plain string (not a fixed enum) since valid values differ per card
 * type (APPROVE/REJECT for most, OKAY for EDD_NEARING, TRANSFER/CLOSE for
 * MISSED_VISIT) — the service layer validates the value against the
 * specific card type it resolves to.
 */
export const decideQuickResponseSchema = z
  .object({
    cardSource: z.enum(['approval_requests', 'escalation_events']),
    decision: z.string().trim().min(1),
    decisionReasonCodeLookupId: z.string().uuid().optional(),
    decisionNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type DecideQuickResponseInput = z.infer<typeof decideQuickResponseSchema>;
