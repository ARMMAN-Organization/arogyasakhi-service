import { z } from 'zod';

/**
 * Caps how many card ids one batch request can ask for, so a caller can't
 * pass an unbounded id list in one request. This only collapses the
 * client→approval-service hop count from N to 1 — each card in the batch
 * still fans out to ~4 downstream services during enrichment (see
 * QuickResponseService.getCardDetails's doc comment), so downstream fan-out
 * is not eliminated by this cap alone. Kept below list-quick-response.dto.ts's
 * page `limit` max of 100: the Supervisor app's card screen never opens more
 * than a page's worth of cards at once.
 */
export const MAX_BATCH_CARD_IDS = 50;

/**
 * Query schema for `GET /quick-response/details?cardIds=...`. Kept as a
 * plain string + `.refine()` (not `z.coerce.*`/`.transform()`), matching
 * closure-reopen-service's decision-status-query.dto.ts and every other
 * "by-ids" DTO in this codebase's own note on why — zod-to-openapi cannot
 * introspect a `ZodEffects`-wrapped transform and crashes OpenAPI doc
 * generation at startup. The split into an array happens in the controller
 * via `parseCardIdsParam`.
 */
export const getQuickResponseDetailsSchema = z
  .object({
    cardIds: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const ids = v.split(',');
          return (
            ids.length <= MAX_BATCH_CARD_IDS &&
            ids.every((id) => z.string().uuid().safeParse(id.trim()).success)
          );
        },
        {
          message: `cardIds: must be a comma-separated list of at most ${MAX_BATCH_CARD_IDS} uuids`,
        },
      ),
  })
  .strict();

export type GetQuickResponseDetailsInput = z.infer<typeof getQuickResponseDetailsSchema>;

/** Splits the comma-separated `cardIds` query param into an array, trimming each entry. */
export function parseCardIdsParam(cardIds: string): string[] {
  return cardIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
