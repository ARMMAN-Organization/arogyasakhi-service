import { z } from 'zod';

/**
 * Query params for `GET /visits/visit-summary/by-type` — same optional
 * sakhiId scoping as visit-summary-query.dto.ts's visitSummaryQuerySchema,
 * but no fromDate/toDate: the this-week/this-month windows are always
 * computed server-side (Monday-start UTC week, calendar-month UTC), not
 * caller-overridable.
 */
export const visitSummaryByTypeQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
  })
  .strict();

export type VisitSummaryByTypeQueryInput = z.infer<typeof visitSummaryByTypeQuerySchema>;
