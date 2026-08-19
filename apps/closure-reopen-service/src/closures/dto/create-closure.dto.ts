import { z } from 'zod';

/**
 * Validation schema for creating a closure. Fields match `closures` exactly
 * (prisma/schema.prisma model Closure) — no invented fields. Audit/soft-delete
 * columns (createdByUserId, updatedByUserId, isDeleted, deletedAt) are
 * server-set and excluded from client input.
 *
 * supervisorStatus/supervisorId/supervisorNotes are deliberately NOT fields
 * here — they used to be client-suppliable, which let a SAKHI POST
 * `supervisorStatus: "APPROVED"` directly and bypass supervisor review
 * entirely (the beneficiary gets closed immediately with a row falsely
 * showing a decision that was never made). ClosureService.create() now
 * derives supervisorStatus itself from the server's own read of
 * closureReasonLookupValueId — a client can never set it.
 *
 * `.strict()` rejects unknown fields, matching the previous global
 * ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createClosureSchema = z
  .object({
    // Client-generated idempotency key — the mobile app is offline-first and
    // may retry this submission after a dropped connection; a retry with the
    // same value returns the original closure instead of creating a
    // duplicate row or re-firing the Quick Response card / beneficiary-close
    // side effects a second time. Same convention as beneficiary
    // enrollment's localCaseUuid.
    localClosureUuid: z.string().trim().min(1).max(80),
    beneficiaryId: z.string().uuid(),
    closureType: z.enum(['MEDICAL', 'NON_MEDICAL', 'PROGRAM_COMPLETION']),
    // lookup_values.lookup_value_id (category CLOSURE_REASON) — fetched via
    // GET /lookups/CLOSURE_REASON (auth-service). Replaces the previous
    // MISCARRIAGE/ABORTION/MATERNAL_DEATH/INFANT_OR_CHILD_DEATH/MIGRATION/
    // WITHDRAWAL/PROGRAM_CYCLE_COMPLETED/OTHER Postgres enum.
    closureReasonLookupValueId: z.string().uuid(),
    eventDate: z.coerce.date().optional(),
    closureDate: z.coerce.date(),
    submittedByUserId: z.string().uuid(),
  })
  .strict();

export type CreateClosureInput = z.infer<typeof createClosureSchema>;
