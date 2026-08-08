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
    beneficiaryId: z.string().uuid(),
    requestReason: z.enum(['MIGRATION_RETURNED', 'CLOSED_BY_MISTAKE', 'OTHER']),
  })
  .strict();

export type CreateReopenRequestInput = z.infer<typeof createReopenRequestSchema>;
