import { z } from 'zod';

/**
 * Query params for `GET /closures/by-sakhi` — cursor-paginated, optionally
 * scoped to one Sakhi. Closure carries no sakhiId column of its own (only
 * beneficiaryId), so `sakhiId` here is resolved against beneficiary-
 * service's `GET /beneficiaries/ids` first (see closure.service.ts's
 * listBySakhi), which applies the SAKHI-own-id / SUPERVISOR-roster /
 * MANAGER-ADMIN-unscoped rule and 403s on an out-of-roster sakhiId itself.
 *
 * `cursor`/`limit` match the Data Restore CR's other list endpoints (GET
 * /visits, GET /visit-schedules, GET /form-submissions, GET /risk-referrals):
 * opaque base64url cursor, limit 1-100, default 50.
 */
export const listClosuresQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListClosuresQueryInput = z.infer<typeof listClosuresQuerySchema>;
