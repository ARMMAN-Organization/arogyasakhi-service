import { z } from 'zod';

/**
 * Query params for `GET /form-submissions` — cursor-paginated, optionally
 * scoped to one Sakhi. FormSubmission carries no sakhiId column of its own
 * (only beneficiaryId), so `sakhiId` here is resolved against
 * beneficiary-service's `GET /beneficiaries/ids` first (see
 * form.service.ts's list()), which applies the same SAKHI-own-id /
 * SUPERVISOR-roster / MANAGER-ADMIN-unscoped rule
 * list-visit-schedules.dto.ts documents for GET /visit-schedules.
 *
 * `cursor`/`limit` match list-visits.dto.ts's convention exactly: opaque
 * base64url cursor, limit 1-100, default 50.
 */
export const listFormSubmissionsQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListFormSubmissionsQueryInput = z.infer<typeof listFormSubmissionsQuerySchema>;
