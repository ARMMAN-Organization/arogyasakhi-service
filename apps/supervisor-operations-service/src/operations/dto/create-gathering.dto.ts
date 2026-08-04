import { z } from 'zod';

/**
 * Validation schema for creating a Training gathering (session) under a
 * TRAINING event — at least one topic must be selected, matching the
 * topic-picker screen's requirement that a session always covers specific
 * topics. `.strict()` rejects unknown fields, matching the repo-wide
 * convention.
 */
export const createGatheringSchema = z
  .object({
    gatheringDate: z.coerce.date(),
    topicIds: z.array(z.string().uuid()).min(1),
    remarks: z.string().trim().min(1).optional(),
  })
  .strict();

export type CreateGatheringInput = z.infer<typeof createGatheringSchema>;
