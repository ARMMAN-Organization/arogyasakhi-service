import { z } from 'zod';

/**
 * Validation schema for a Sakhi's LMP change request (FR-SV-4.2's raise
 * side). `.strict()` rejects unknown fields, matching this repo's global
 * convention.
 *
 * `requestedByUserId` is deliberately NOT a field here — it is always the
 * authenticated caller's own id (see lmp-change-request.service.ts), never
 * client-supplied, same convention as reopen requests.
 */
export const createLmpChangeRequestSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    newLmpDate: z.coerce.date(),
    sonographyImageAssetId: z.string().uuid().optional(),
    // Client-generated idempotency key — the mobile app is offline-first and
    // may retry this submission after a dropped connection; a retry with the
    // same value returns the original LMP change request instead of creating
    // a duplicate row. Same convention as reopen requests'
    // localReopenRequestUuid / closures' localClosureUuid.
    localRequestUuid: z.string().trim().min(1).max(80),
  })
  .strict();

export type CreateLmpChangeRequestInput = z.infer<typeof createLmpChangeRequestSchema>;
