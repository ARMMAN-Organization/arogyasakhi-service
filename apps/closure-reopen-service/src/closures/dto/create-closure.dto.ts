import { z } from 'zod';

/**
 * Validation schema for creating a closure. Fields match `closures` exactly
 * (prisma/schema.prisma model Closure) — no invented fields. Audit/soft-delete
 * columns (createdByUserId, updatedByUserId, isDeleted, deletedAt) are
 * server-set and excluded from client input.
 * `.strict()` rejects unknown fields, matching the previous global
 * ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createClosureSchema = z
  .object({
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
    supervisorStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    supervisorId: z.string().uuid().optional(),
    supervisorNotes: z.string().trim().min(1).optional(),
  })
  .strict();

export type CreateClosureInput = z.infer<typeof createClosureSchema>;
