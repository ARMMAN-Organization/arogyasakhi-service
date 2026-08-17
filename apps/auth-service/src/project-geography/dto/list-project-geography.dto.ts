import { z } from 'zod';

/**
 * Query schema for `GET /project-geography?projectId=...` — the geography
 * units a project is currently active in, so a client can scope its
 * geography-unit download to the project instead of pulling the entire
 * state tree. `projectId` is required — this is a project-scoped download,
 * not a general list.
 */
export const listProjectGeographyQuerySchema = z
  .object({
    projectId: z.string().uuid(),
  })
  .strict();

export type ListProjectGeographyQuery = z.infer<typeof listProjectGeographyQuerySchema>;
