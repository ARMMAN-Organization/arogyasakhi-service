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
    effectiveFrom: z.coerce.date().optional(),
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .strict();

export type UpdateLocationAssignmentInput = z.infer<typeof updateLocationAssignmentSchema>;
