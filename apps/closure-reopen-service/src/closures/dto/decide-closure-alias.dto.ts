import { z } from 'zod';

/**
 * Validation schema for the Supervisor app's POST decision alias
 * (POST /closures/:id/decision), which uses APPROVE/REJECT vocabulary
 * instead of the PATCH endpoint's APPROVED/REJECTED — translated in the
 * controller before delegating to the existing `ClosureService.decide`.
 * `decisionReasonCodeLookupId` is accepted for request-shape parity with the
 * other decision endpoints but not persisted — `Closure` has no column for
 * it (only `supervisorNotes`, which `decisionNotes` maps onto).
 * `.strict()` rejects unknown fields, matching this repo's global convention.
 */
export const decideClosureAliasSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    decisionReasonCodeLookupId: z.string().uuid().optional(),
    decisionNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type DecideClosureAliasInput = z.infer<typeof decideClosureAliasSchema>;
