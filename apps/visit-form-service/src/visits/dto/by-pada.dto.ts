import { z } from 'zod';

/**
 * Body for `POST /visits/by-pada` — the caller (api-gateway's pada
 * visit-list aggregation) has already resolved the in-scope beneficiary
 * ids via beneficiary-service's own role-scoping; this endpoint trusts
 * that list and does no scoping of its own.
 */
export const byPadaSchema = z
  .object({
    beneficiaryIds: z.array(z.string().uuid()),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)'),
  })
  .strict();

export type ByPadaInput = z.infer<typeof byPadaSchema>;
