import { z } from 'zod';

/**
 * Query params for `GET /visit-schedules` — cursor-paginated, optionally
 * scoped to one Sakhi. VisitSchedule carries no sakhiId column of its own
 * (only beneficiaryId), so `sakhiId` here is resolved against
 * beneficiary-service's `GET /beneficiaries/ids` first (see
 * visitSchedule.service.ts's list()), which applies the same SAKHI-own-id /
 * SUPERVISOR-roster / MANAGER-ADMIN-unscoped rule `list-visits.dto.ts`
 * documents for GET /visits.
 *
 * `cursor`/`limit` match list-visits.dto.ts's convention exactly: opaque
 * base64url cursor, limit 1-100, default 50.
 */
export const listVisitSchedulesQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListVisitSchedulesQueryInput = z.infer<typeof listVisitSchedulesQuerySchema>;
