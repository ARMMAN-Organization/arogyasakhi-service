import { z } from 'zod';

/** Query schema for `GET /sakhi-calls` — required `sakhiId`, unlike the path-param sibling `GET /call-logs/by-sakhi/:sakhiId`. */
export const listSakhiCallsQuerySchema = z
  .object({
    sakhiId: z.string().uuid(),
  })
  .strict();

export type ListSakhiCallsQuery = z.infer<typeof listSakhiCallsQuerySchema>;
