import { z } from 'zod';

/**
 * Query params for `GET /incentive-rates/active` — resolves the currently
 * effective rate for a rate/referral type combination (FR-SV-4.9's
 * incentive trigger needs to know the amount before creating an
 * incentive_events row). `.strict()` rejects unknown fields, matching this
 * repo's global convention.
 */
export const listActiveRateQuerySchema = z
  .object({
    rateType: z.enum(['VISIT', 'REFERRAL', 'MEETING', 'TRAINING', 'RETAINER']),
    referralType: z.enum(['STANDARD', 'ACCOMPANIED']).optional(),
    geographyUnitId: z.string().uuid().optional(),
    asOf: z.coerce.date().optional(),
  })
  .strict();

export type ListActiveRateQuery = z.infer<typeof listActiveRateQuerySchema>;
