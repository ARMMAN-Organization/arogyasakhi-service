import { z } from 'zod';

/**
 * Validation schema for creating a training topic (reusable topic-picker
 * catalog master data). ADMIN-only — this is centrally managed catalog
 * data, not something recorded per-event. `.strict()` rejects unknown
 * fields, matching the repo-wide convention.
 */
export const createTrainingTopicSchema = z
  .object({
    topicCode: z.string().trim().min(1).max(80),
    topicName: z.string().trim().min(1).max(160),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .strict();

export type CreateTrainingTopicInput = z.infer<typeof createTrainingTopicSchema>;
