import { z } from 'zod';

/**
 * Validation schema for `POST /sakhis/:sakhiId/location-assignments`.
 * `.strict()` rejects unknown fields, matching the repo's global convention.
 * `villageId`/`padaId` are validated against `geography_units` (correct
 * geoType, ACTIVE, not soft-deleted) in the service — not here, since that
 * needs a database lookup.
 */
export const createLocationAssignmentSchema = z
  .object({
    projectId: z.string().uuid(),
    villageId: z.string().uuid(),
    padaId: z.string().uuid().optional(),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().optional(),
  })
  .strict();

export type CreateLocationAssignmentInput = z.infer<typeof createLocationAssignmentSchema>;
