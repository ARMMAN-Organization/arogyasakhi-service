import { z } from 'zod';

/**
 * Query params for `GET /visits` — cursor-paginated, optionally scoped to
 * one Sakhi. `sakhiId` is validated against the caller's own role scope in
 * the service layer (SAKHI is always forced to her own id; SUPERVISOR must
 * pass a sakhiId on her own roster or omit it for the whole roster;
 * MANAGER/ADMIN may pass any sakhiId or omit it for fully unscoped) — see
 * visitInstance.service.ts's list() for the exact rule, same shape as
 * getVisitSummary's already-established scoping.
 *
 * `cursor`/`limit` match beneficiary-service's list-beneficiaries.dto.ts
 * convention exactly: opaque base64url cursor, limit 1-100, default 50.
 */
export const listVisitsQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
    // Opaque, base64-encoded cursor — see visitInstance.repository.ts's encode/decodeCursor.
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListVisitsQueryInput = z.infer<typeof listVisitsQuerySchema>;
