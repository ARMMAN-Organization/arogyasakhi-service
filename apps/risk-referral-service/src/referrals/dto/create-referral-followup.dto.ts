import { z } from 'zod';

/**
 * Validation schema for submitting a referral follow-up (SRS FR-S-6.3,
 * Appendix E.3) — "did the beneficiary visit the facility?" Yes -> Complete;
 * No -> a reason is required. `.strict()` rejects unknown fields, matching
 * this repo's global convention.
 */
export const createReferralFollowupSchema = z
  .object({
    visitedFacilityFlag: z.boolean(),
    followupDate: z.coerce.date(),
    notVisitedReason: z.string().trim().min(1).max(255).optional(),
    treatmentGiven: z.string().trim().min(1).optional(),
    outcome: z.string().trim().min(1).max(255).optional(),
    casePaperMediaId: z.string().uuid().optional(),
  })
  .strict()
  .refine((data) => data.visitedFacilityFlag || !!data.notVisitedReason, {
    message: 'notVisitedReason is required when visitedFacilityFlag is false.',
    path: ['notVisitedReason'],
  });

export type CreateReferralFollowupInput = z.infer<typeof createReferralFollowupSchema>;
