import { z } from 'zod';

/**
 * Batch is a single query, not N sequential lookups, but still capped so a
 * caller can't ask for an unbounded IN(...) list in one request. Mirrors
 * closure-reopen-service's decision-status-query.dto.ts's own cap of 100 —
 * approval-service's Quick Response card-detail list is this endpoint's
 * driving caller and never asks for more ids than one page of cards.
 */
export const MAX_BATCH_GEOGRAPHY_UNIT_IDS = 100;

/**
 * Query schema for `GET /geography-units/by-ids?ids=...`. Kept as a plain
 * string + `.refine()` (not `z.coerce.*`/`.transform()`), matching
 * decision-status-query.dto.ts's own note on why — zod-to-openapi cannot
 * introspect a `ZodEffects`-wrapped transform and crashes OpenAPI doc
 * generation at startup. The split into an array happens in the controller
 * via `parseIdsParam`.
 */
export const byIdsQuerySchema = z
  .object({
    ids: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const ids = v.split(',');
          return (
            ids.length <= MAX_BATCH_GEOGRAPHY_UNIT_IDS &&
            ids.every((id) => z.string().uuid().safeParse(id.trim()).success)
          );
        },
        {
          message: `ids: must be a comma-separated list of at most ${MAX_BATCH_GEOGRAPHY_UNIT_IDS} uuids`,
        },
      ),
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
