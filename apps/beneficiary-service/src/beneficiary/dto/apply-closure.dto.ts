import { z } from 'zod';

/**
 * Body for `PATCH /beneficiaries/:id/close` — closes a beneficiary case
 * after a closure submission (ANC_CLOSURE_VISIT / CHILD_CLOSURE_VISIT).
 * Called server-to-server by closure-reopen-service: immediately for a
 * non-reviewed closure (MEDICAL/NON_MEDICAL/PROGRAM_COMPLETION), or once a
 * Supervisor approves a MIGRATION closure. `reasonCode` is the closure's own
 * `closureType`, recorded on beneficiary_status_history for audit — not
 * re-validated against the CLOSURE_REASON lookup here, since
 * closure-reopen-service (which owns that lookup relationship) already did.
 */
export const applyClosureSchema = z
  .object({
    reasonCode: z.string().trim().min(1).max(60),
  })
  .strict();

export type ApplyClosureInput = z.infer<typeof applyClosureSchema>;
