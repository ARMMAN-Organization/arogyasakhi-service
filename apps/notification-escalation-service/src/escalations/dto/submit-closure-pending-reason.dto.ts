import { z } from 'zod';

/**
 * Validation schema for POST /escalations/:id/closure-pending-reason. The
 * caller supplies auth-service's CLOSURE_PENDING_REASON lookup_value_id
 * (environment-specific, not a stable literal) — EscalationService resolves
 * it server-side to a valueCode to know whether `notes` is required (OTHER).
 * `.strict()` rejects unknown fields, matching this repo's global convention.
 */
export const submitClosurePendingReasonSchema = z
  .object({
    pendingReasonLookupValueId: z.string().uuid(),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type SubmitClosurePendingReasonInput = z.infer<typeof submitClosurePendingReasonSchema>;
