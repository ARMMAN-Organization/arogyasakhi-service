import { z } from 'zod';

/**
 * Validation schema for a Supervisor's decision on a referral, backing two
 * Quick Response card types with different outcomes (FR-SV-4.5, FR-SV-4.9):
 * - LAPSE: Referral Follow-up Incomplete, approved — marks the referral
 *   Lapsed (FR-SV-4.5).
 * - REFILL: Referral Follow-up Incomplete, rejected — no status change; the
 *   Sakhi must fill the follow-up form again.
 * - COMPLETE: Accompanied Referral, approved — marks the referral Completed
 *   (FR-SV-4.9). Its reject path makes no referral-side call at all (the
 *   referral stays Pending), so REJECT isn't a value here.
 *
 * `.strict()` rejects unknown fields, matching this repo's global convention.
 *
 * `decisionNotes` is optional free-text captured alongside the decision
 * (e.g. why a follow-up was rejected/refilled) — persisted verbatim to
 * Referral.decisionNotes, mirroring ReopenRequest's own decisionNotes field.
 */
export const decideReferralSchema = z
  .object({
    decision: z.enum(['LAPSE', 'REFILL', 'COMPLETE']),
    decisionNotes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export type DecideReferralInput = z.infer<typeof decideReferralSchema>;
