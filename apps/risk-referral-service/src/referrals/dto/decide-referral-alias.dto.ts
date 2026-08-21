import { z } from 'zod';

/**
 * Validation schema for the Supervisor app's Accompanied Referral decision
 * alias (POST /referrals/:id/decision), which uses APPROVE/REJECT vocabulary
 * instead of the PATCH endpoint's LAPSE/REFILL/COMPLETE — translated in
 * ReferralService.decideAccompanied before delegating to the existing
 * decide(). `decisionReasonCodeLookupId`/`decisionNotes` are accepted for
 * request-shape parity with the other decision endpoints but not persisted
 * — `Referral` has neither column. `.strict()` rejects unknown fields,
 * matching this repo's global convention.
 */
export const decideReferralAliasSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    decisionReasonCodeLookupId: z.string().uuid().optional(),
    decisionNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type DecideReferralAliasInput = z.infer<typeof decideReferralAliasSchema>;
