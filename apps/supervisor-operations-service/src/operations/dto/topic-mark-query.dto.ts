import { z } from 'zod';

/**
 * Query params for GET /topics/:topicId/marks and the request body shared
 * shape for PUT/POST mark endpoints — a mark is uniquely identified by
 * (gatheringId, topicId, sakhiId, markType), not topicId alone, so all four
 * are required to disambiguate. `.strict()` rejects unknown fields, matching
 * the repo-wide convention.
 */
export const topicMarkQuerySchema = z
  .object({
    gatheringId: z.string().uuid(),
    sakhiId: z.string().uuid(),
    type: z.enum(['PRE', 'POST']),
  })
  .strict();

export type TopicMarkQuery = z.infer<typeof topicMarkQuerySchema>;
