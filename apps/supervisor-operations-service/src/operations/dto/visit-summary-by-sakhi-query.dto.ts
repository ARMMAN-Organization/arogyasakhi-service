import { z } from 'zod';

/**
 * Query params for `GET /visits/by-sakhi/:sakhiId/summary`. Same date-range
 * shape as visit-form-service's own `visitSummaryQuerySchema` — `sakhiId` is
 * a path param here instead, since this route is dedicated per-Sakhi.
 */
export const visitSummaryBySakhiQuerySchema = z
  .object({
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)')
      .optional(),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)')
      .optional(),
  })
  .strict();

export type VisitSummaryBySakhiQueryInput = z.infer<typeof visitSummaryBySakhiQuerySchema>;
