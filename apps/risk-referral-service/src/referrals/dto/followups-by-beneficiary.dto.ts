import { z } from 'zod';

/**
 * Body for `POST /referrals/followups-by-beneficiary` — the caller
 * (api-gateway's pada visit-list aggregation) has already resolved the
 * in-scope beneficiary ids via beneficiary-service's own role-scoping;
 * this endpoint trusts that list and does no scoping of its own.
 */
export const followupsByBeneficiarySchema = z
  .object({
    beneficiaryIds: z.array(z.string().uuid()),
  })
  .strict();

export type FollowupsByBeneficiaryInput = z.infer<typeof followupsByBeneficiarySchema>;
