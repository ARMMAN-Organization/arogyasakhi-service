import { z } from 'zod';

/**
 * Validation schema for `PATCH /sakhis/:sakhiId/location-assignments/:assignmentId/end`.
 * `effectiveTo` defaults to today (set in the service, not here) when omitted
 * — "end this assignment as of now" is the common case.
 */
export const endLocationAssignmentSchema = z
  .object({
    effectiveTo: z.coerce.date().optional(),
  })
  .strict();

export type EndLocationAssignmentInput = z.infer<typeof endLocationAssignmentSchema>;
