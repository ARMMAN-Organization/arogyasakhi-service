import { z } from 'zod';

/**
 * Query schema for `GET /media?followupId=...` — narrows the asset list to
 * one referral follow-up's evidence media (case paper, discharge summary,
 * facility photo, etc.). Omitting followupId preserves the existing
 * unfiltered "50 most recent" behavior. `.strict()` rejects unknown fields.
 */
export const listMediaAssetsQuerySchema = z
  .object({
    followupId: z.string().uuid().optional(),
  })
  .strict();

export type ListMediaAssetsQuery = z.infer<typeof listMediaAssetsQuerySchema>;
