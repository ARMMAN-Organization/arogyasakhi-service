import { z } from 'zod';

/**
 * Validation schema for `POST /sakhis/:sakhiId/location-assignments`.
 * `.strict()` rejects unknown fields, matching the repo's global convention.
 * `villageId`/`padaId` are validated against `geography_units` (correct
 * geoType, ACTIVE, not soft-deleted) in the service — not here, since that
 * needs a database lookup.
 *
 * No `projectId` field: the assignment's project is always the Sakhi's own
 * `sakhi_profiles.primaryProjectId`, derived server-side in
 * SakhiService.createLocationAssignment — accepting it as client input
 * would let a caller create an assignment misattributed to a project the
 * Sakhi doesn't actually belong to (security review finding).
 */
export const createLocationAssignmentSchema = z
  .object({
    villageId: z.string().uuid(),
    padaId: z.string().uuid().optional(),
    effectiveFrom: z.coerce.date(),
    // .nullable() so an explicit `{"effectiveTo": null}` (open-ended
    // assignment) parses as null instead of z.coerce.date() silently
    // coercing null to the Unix epoch — see sakhi.service.ts's
    // `input.effectiveTo ?? null`, which already treats null/undefined alike.
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .strict();

export type CreateLocationAssignmentInput = z.infer<typeof createLocationAssignmentSchema>;
