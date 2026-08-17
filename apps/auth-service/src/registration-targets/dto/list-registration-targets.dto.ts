import { z } from 'zod';

/**
 * Query schema for `GET /registration-targets?sakhiId=...` — a Sakhi's
 * registration target(s) for offline reference, scoped to one Sakhi.
 * `sakhiId` is required — this is a Sakhi-scoped download, matching
 * `list-project-geography.dto.ts`'s convention, not a general list.
 */
export const listRegistrationTargetsQuerySchema = z
  .object({
    sakhiId: z.string().uuid(),
  })
  .strict();

export type ListRegistrationTargetsQuery = z.infer<typeof listRegistrationTargetsQuerySchema>;
