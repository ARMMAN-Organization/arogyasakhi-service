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
    diagnosis: z.string().trim().min(1).optional(),
    treatmentGiven: z.string().trim().min(1).optional(),
    outcome: z.string().trim().min(1).max(255).optional(),
    // Media evidence — case paper, discharge summary, facility photo,
    // Sakhi-beneficiary photo, investigation reports — is uploaded to
    // media-service directly (POST /media/upload-url then POST /media,
    // tagged with this follow-up's real id and the correct assetType per
    // asset) BEFORE this call; this field only lists the resulting ids so
    // ReferralFollowupService can confirm each one actually exists and is
    // viewable by this caller (mediaAssetExists) before accepting the
    // follow-up as evidenced. Capped at 10 — a sane bound, not an SRS number.
    mediaAssetIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .strict()
  .refine((data) => data.visitedFacilityFlag || !!data.notVisitedReason, {
    message: 'notVisitedReason is required when visitedFacilityFlag is false.',
    path: ['notVisitedReason'],
  });

export type CreateReferralFollowupInput = z.infer<typeof createReferralFollowupSchema>;
