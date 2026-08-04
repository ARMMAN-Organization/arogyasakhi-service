import { z } from 'zod';

/**
 * Validation schema for PUT /topics/:topicId/marks — saves one Pre or Post
 * score for one Sakhi in one gathering. Blocked at the service layer (409)
 * if the referenced mark is already locked via POST .../marks/complete.
 * Score range (0-100) matches the existing preTrainingScore/
 * postTrainingScore bounds in update-attendance.dto.ts. `.strict()` rejects
 * unknown fields, matching the repo-wide convention.
 */
export const createTopicMarkSchema = z
  .object({
    gatheringId: z.string().uuid(),
    sakhiId: z.string().uuid(),
    markType: z.enum(['PRE', 'POST']),
    score: z.number().min(0).max(100),
  })
  .strict();

export type CreateTopicMarkInput = z.infer<typeof createTopicMarkSchema>;

/**
 * Validation schema for POST /topics/:topicId/marks/complete — locks an
 * existing mark so PUT can no longer edit it. No score field: this only
 * transitions isLocked, it never sets/changes the value itself.
 */
export const completeTopicMarkSchema = z
  .object({
    gatheringId: z.string().uuid(),
    sakhiId: z.string().uuid(),
    markType: z.enum(['PRE', 'POST']),
  })
  .strict();

export type CompleteTopicMarkInput = z.infer<typeof completeTopicMarkSchema>;
