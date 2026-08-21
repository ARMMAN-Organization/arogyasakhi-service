import { z } from 'zod';

/** Query params for `GET /sync/stale-sakhis`. */
export const staleSakhisQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().default(3),
  })
  .strict();

export type StaleSakhisQueryInput = z.infer<typeof staleSakhisQuerySchema>;
