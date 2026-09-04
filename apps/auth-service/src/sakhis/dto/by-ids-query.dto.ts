import { z } from 'zod';

/**
 * Query params for `GET /sakhis/by-ids`. `ids` is a comma-separated list of
 * Sakhi ids (`users.user_id`) — kept as a plain string here (not
 * `.transform()`ed) because `createDocumentedRouter()` cannot introspect a
 * ZodEffects as an OpenAPI parameter object; the split into an array happens
 * in the controller, same as beneficiary-service's
 * by-ids-with-risk-query.dto.ts.
 */
export const byIdsQuerySchema = z
  .object({
    ids: z.string().trim().min(1),
  })
  .strict();

export type ByIdsQueryInput = z.infer<typeof byIdsQuerySchema>;

/** Splits the comma-separated `ids` query param into an array, trimming each entry. */
export function parseIdsParam(ids: string): string[] {
  return ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
