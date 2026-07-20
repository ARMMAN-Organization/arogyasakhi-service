import { z } from 'zod';

/**
 * Validation schema for creating a visit instance. Fields match
 * visit_instances exactly (docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md,
 * Appendix A) — no invented fields. scheduleId/beneficiaryId/sakhiId are plain
 * scalar foreign keys (beneficiary_cases and sakhi_profiles are owned by other
 * services per the forklift rule), but they are still UUID-shaped ids so we
 * validate them as such.
 * `.strict()` rejects unknown fields, matching the previous global
 * ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createVisitInstanceSchema = z
  .object({
    scheduleId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    sakhiId: z.string().uuid(),
    localVisitUuid: z.string().trim().min(1).max(80),
    // lookup_values.lookup_value_id (category VISIT_STATUS) — fetched via
    // GET /lookups/VISIT_STATUS (auth-service). Replaces the previous
    // STARTED/PENDING/MISSED/COMPLETED/DISCARDED Postgres enum.
    statusLookupValueId: z.string().uuid(),
    actualVisitDate: z.coerce.date().optional(),
    meetBeneficiaryFlag: z.boolean().optional(),
    notMetReason: z.string().trim().min(1).max(255).optional(),
    completedAt: z.coerce.date().optional(),
    syncedAt: z.coerce.date().optional(),
  })
  .strict();

export type CreateVisitInstanceInput = z.infer<typeof createVisitInstanceSchema>;
