import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries/ids` — just the same sakhiId
 * role-scoping narrowing as summaryQuerySchema, no date range or pagination:
 * callers need the full in-scope id set, not a slice of it.
 */
export const idsQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
  })
  .strict();

export type IdsQueryInput = z.infer<typeof idsQuerySchema>;
