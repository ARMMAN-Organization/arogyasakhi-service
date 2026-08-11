import { z } from 'zod';

const visitScheduleStatusSchema = z.enum([
  'GENERATED',
  'OPEN',
  'MISSED',
  'COMPLETED',
  'SUPERSEDED',
  'CANCELLED',
  'LAPSED',
]);

/**
 * Query for `GET /visit-schedules` — beneficiaryId is always required (no
 * unscoped multi-beneficiary mode, even for MANAGER/ADMIN): every other
 * visit-schedules operation in this service is beneficiary-scoped, and
 * mobile sync is inherently per-beneficiary.
 *
 * `.strict()`, not `.refine()`-wrapped — same reason as
 * createVisitScheduleBulkSchema's dateOnlySchema comment and
 * list-beneficiaries.dto.ts: createDocumentedRouter()'s OpenAPI generation
 * can't introspect a ZodEffects.
 */
export const listVisitSchedulesQuerySchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    status: visitScheduleStatusSchema.optional(),
    // Delta-sync filter — only rows updated after this instant. A full ISO
    // datetime (not dateOnlySchema) since updatedAt carries a time component.
    updatedAfter: z.string().datetime().optional(),
    // Opaque, base64url-encoded cursor — see visitSchedule.repository.ts's
    // encode/decodeCursor.
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListVisitSchedulesQuery = z.infer<typeof listVisitSchedulesQuerySchema>;
