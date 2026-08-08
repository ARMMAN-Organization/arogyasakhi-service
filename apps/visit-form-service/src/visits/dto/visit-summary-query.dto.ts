import { z } from 'zod';

/**
 * Query params for `GET /visits/visit-summary` — same role-scoping
 * (sakhiId) and date-range shape as beneficiary-service's summary
 * endpoints, filtered on VisitSchedule.scheduledDate (when the visit was
 * due), not actualVisitDate — see visitInstance.repository.ts's
 * countByStatus doc comment.
 */
export const visitSummaryQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
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

export type VisitSummaryQueryInput = z.infer<typeof visitSummaryQuerySchema>;
