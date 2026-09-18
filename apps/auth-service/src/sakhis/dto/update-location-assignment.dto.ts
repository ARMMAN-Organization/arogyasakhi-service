import { z } from 'zod';

/**
 * Validation schema for `PATCH /sakhis/:sakhiId/location-assignments/:assignmentId`.
 * All fields optional (partial update) — `.strict()` rejects unknown fields.
 * `projectId` is intentionally omitted here: it is set once at creation and
 * not editable, matching sakhi_profiles.primaryProjectId's own treatment
 * elsewhere in this service (moving a Sakhi/assignment between projects is a
 * separate, unmodeled operation, not a field edit).
 */
export const updateLocationAssignmentSchema = z
  .object({
    villageId: z.string().uuid().optional(),
    padaId: z.string().uuid().nullable().optional(),
    // z.coerce.date() alone would coerce an explicit `null` to the Unix epoch
    // (new Date(null) is a valid Date) instead of failing — .nullable() lets
    // Zod see the null before coercion runs, and the refine then rejects it,
    // since effectiveFrom has no "clear" semantics (unlike effectiveTo below).
    effectiveFrom: z.coerce
      .date()
      .nullable()
      .optional()
      .refine((v) => v !== null, { message: 'effectiveFrom cannot be null.' }),
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .strict();

export type UpdateLocationAssignmentInput = z.infer<typeof updateLocationAssignmentSchema>;
