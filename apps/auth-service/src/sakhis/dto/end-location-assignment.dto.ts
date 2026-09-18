import { z } from 'zod';

/**
 * Validation schema for `PATCH /sakhis/:sakhiId/location-assignments/:assignmentId/end`.
 * `effectiveTo` defaults to today (set in the service, not here) when omitted
 * — "end this assignment as of now" is the common case.
 */
export const endLocationAssignmentSchema = z
  .object({
    // .nullable() so an explicit `{"effectiveTo": null}` parses as null (the
    // service's `effectiveTo ?? new Date()` then defaults to today) instead
    // of z.coerce.date() silently coercing null to the Unix epoch.
    effectiveTo: z.coerce.date().nullable().optional(),
  })
  .strict();

export type EndLocationAssignmentInput = z.infer<typeof endLocationAssignmentSchema>;
