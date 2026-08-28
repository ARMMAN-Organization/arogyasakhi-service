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
    // Sakhi-beneficiary photo, investigation reports — is finalized against
    // media-service (POST /media/upload-url then POST /media) AFTER this
    // call succeeds, since ReferralFollowup.id is server-generated inside
    // this endpoint's own transaction and cannot be known beforehand (PR
    // #199 review — a prior version of this comment incorrectly said
    // "before this call", which is impossible: a client has no real id to
    // tag media with until this response comes back). mediaAssetIds here is
    // therefore only useful on a SECOND call after evidence has already been
    // finalized with the real followupId — e.g. a client that submits the
    // follow-up first with an empty list, then calls this again is not
    // supported today (this repository.create only ever creates a new
    // ReferralFollowup, it cannot attach media to an existing one). For now
    // this field exists so ReferralFollowupService can confirm any ids
    // already submitted actually exist and are viewable (mediaAssetExists)
    // before accepting the follow-up as evidenced; the realistic near-term
    // client flow is to leave this empty and finalize media separately,
    // tagged with the returned followupId, then use GET
    // /media?followupId=<id> to confirm what's attached. Capped at 10 — a
    // sane bound, not an SRS number.
    mediaAssetIds: z.array(z.string().uuid()).max(10).default([]),
  })
  .strict()
  .refine((data) => data.visitedFacilityFlag || !!data.notVisitedReason, {
    message: 'notVisitedReason is required when visitedFacilityFlag is false.',
    path: ['notVisitedReason'],
  });

export type CreateReferralFollowupInput = z.infer<typeof createReferralFollowupSchema>;
