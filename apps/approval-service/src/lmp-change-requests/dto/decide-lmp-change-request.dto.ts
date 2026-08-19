import { z } from 'zod';

/**
 * Validation schema for the Supervisor app's dedicated LMP Change decision
 * resource (POST /lmp-change-requests/:id/decision) — a thin wrapper around
 * Quick Response's own LMP_CHANGE card decision. `:id` is the underlying
 * approval_requests row's own id. `.strict()` rejects unknown fields,
 * matching this repo's global convention.
 */
export const decideLmpChangeRequestSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    decisionReasonCodeLookupId: z.string().uuid().optional(),
    decisionNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type DecideLmpChangeRequestInput = z.infer<typeof decideLmpChangeRequestSchema>;
