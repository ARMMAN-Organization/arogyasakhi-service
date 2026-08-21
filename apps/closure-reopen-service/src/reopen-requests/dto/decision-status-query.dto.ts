import { z } from 'zod';

/**
 * Batch is a single query, not N sequential lookups, but still capped so a
 * caller can't ask for an unbounded IN(...) list in one request. Matches
 * list-quick-response.dto.ts's own `limit` max of 100 — Quick Response's
 * list() is this endpoint's only caller today, and never asks for more ids
 * than one page of cards.
 */
export const MAX_BATCH_DECISION_STATUS_IDS = 100;

/**
 * Query schema for `GET /reopen-requests/decision-status?ids=...`. Kept as a
 * plain string + `.refine()` (not `z.coerce.*`), matching
 * list-recent-call-logs.dto.ts's own note on why — zod-to-openapi cannot
 * introspect a `ZodEffects`-wrapped transform and crashes OpenAPI doc
 * generation at startup.
 */
export const decisionStatusQuerySchema = z
  .object({
    ids: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const ids = v.split(',');
          return (
            ids.length <= MAX_BATCH_DECISION_STATUS_IDS &&
            ids.every((id) => z.string().uuid().safeParse(id.trim()).success)
          );
        },
        {
          message: `ids: must be a comma-separated list of at most ${MAX_BATCH_DECISION_STATUS_IDS} uuids`,
        },
      ),
  })
  .strict();

export type DecisionStatusQuery = z.infer<typeof decisionStatusQuerySchema>;
