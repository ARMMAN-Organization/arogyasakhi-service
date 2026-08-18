import { z } from 'zod';

/**
 * Query schema for `GET /arogya-sakhi-roster?projectId=...` — the flat Sakhi
 * roster a client downloads for offline reference, scoped to one project.
 * `projectId` is required — this is a project-scoped download, matching
 * `list-project-geography.dto.ts`'s convention, not a general list.
 */
export const listArogyaSakhiRosterQuerySchema = z
  .object({
    projectId: z.string().uuid(),
  })
  .strict();

export type ListArogyaSakhiRosterQuery = z.infer<typeof listArogyaSakhiRosterQuerySchema>;
