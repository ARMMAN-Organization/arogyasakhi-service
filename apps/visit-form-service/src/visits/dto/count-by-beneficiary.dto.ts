import { z } from 'zod';

/**
 * Body for `POST /visits/count-by-beneficiary` — the caller (api-gateway's
 * pada-breakdown aggregation) has already resolved the in-scope beneficiary
 * ids via beneficiary-service's own role-scoping; this endpoint trusts that
 * list and does no scoping of its own.
 */
export const countByBeneficiarySchema = z
  .object({
    beneficiaryIds: z.array(z.string().uuid()),
  })
  .strict();

export type CountByBeneficiaryInput = z.infer<typeof countByBeneficiarySchema>;
