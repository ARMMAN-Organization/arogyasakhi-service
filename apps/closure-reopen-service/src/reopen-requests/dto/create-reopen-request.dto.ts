import { z } from 'zod';

/**
 * Validation schema for a Sakhi's reopen request (FR-S-10.3). `.strict()`
 * rejects unknown fields, matching this repo's global convention.
 *
 * `requestedByUserId` is deliberately NOT a field here — it is always the
 * authenticated caller's own id (see reopen-request.service.ts), never
 * client-supplied, so a Sakhi can never raise a reopen request under another
 * Sakhi's name.
 */
export const createReopenRequestSchema = z
  .object({
    // Client-generated idempotency key — the mobile app is offline-first and
    // may retry this submission after a dropped connection; a retry with the
    // same value returns the original reopen request instead of creating a
    // duplicate row or re-firing the Quick Response card a second time. Same
    // convention as beneficiary enrollment's localCaseUuid / closures'
    // localClosureUuid.
    localReopenRequestUuid: z.string().trim().min(1).max(80),
    beneficiaryId: z.string().uuid(),
    requestReason: z.enum(['MIGRATION_RETURNED', 'CLOSED_BY_MISTAKE', 'OTHER']),
  })
  .strict();

export type CreateReopenRequestInput = z.infer<typeof createReopenRequestSchema>;
