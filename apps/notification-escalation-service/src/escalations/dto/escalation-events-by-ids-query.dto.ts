import { z } from 'zod';

/**
 * Batch is a single query, not N sequential lookups, but still capped so a
 * caller can't ask for an unbounded IN(...) list in one request. Matches
 * closure-reopen-service's decision-status-query.dto.ts's own `ids` cap —
 * approval-service's Quick Response card-detail resolution is this
 * endpoint's only caller today, and never asks for more ids than one page
 * of cards.
 */
export const MAX_BATCH_ESCALATION_EVENT_IDS = 100;

/**
 * Query schema for `GET /escalation-events/by-ids?ids=...`. Kept as a plain
 * string + `.refine()` (not `z.coerce.*`), matching decision-status-query.dto.ts's
 * own note on why — zod-to-openapi cannot introspect a `ZodEffects`-wrapped
 * transform and crashes OpenAPI doc generation at startup.
 */
export const escalationEventsByIdsQuerySchema = z
  .object({
    ids: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const ids = v.split(',');
          return (
            ids.length <= MAX_BATCH_ESCALATION_EVENT_IDS &&
            ids.every((id) => z.string().uuid().safeParse(id.trim()).success)
          );
        },
        {
          message: `ids: must be a comma-separated list of at most ${MAX_BATCH_ESCALATION_EVENT_IDS} uuids`,
        },
      ),
  })
  .strict();

export type EscalationEventsByIdsQuery = z.infer<typeof escalationEventsByIdsQuerySchema>;
