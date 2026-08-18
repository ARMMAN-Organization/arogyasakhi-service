import { z } from 'zod';

/**
 * Query schema for `GET /gatherings`. `sakhiId` scopes the list to
 * gatherings this Sakhi has a gathering_attendance row for (attended, or was
 * scheduled to attend) — a gathering carries no sakhiId column of its own,
 * so this is a filter through the join table, not a direct column match.
 * Omitted, the list returns recent gatherings generally. Plain optional
 * string (not `.uuid()` composed with `.coerce`), matching
 * list-supervisor-events.dto.ts's convention for zod-to-openapi
 * compatibility. `.strict()` rejects unknown fields, matching the repo-wide
 * convention.
 */
export const listGatheringsQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
  })
  .strict();

export type ListGatheringsQuery = z.infer<typeof listGatheringsQuerySchema>;
