import { z } from 'zod';

/**
 * Batch is a single query, not N sequential lookups, but still capped so a
 * caller can't ask for an unbounded IN(...) list in one request. Matches
 * decision-status-query.dto.ts's own `MAX_BATCH_DECISION_STATUS_IDS` — this
 * endpoint exists for the same reason (approval-service's Quick Response
 * card-detail resolution) and shares its cap.
 */
export const MAX_BATCH_BY_IDS = 100;

/**
 * Query schema for `GET /referrals/by-ids?ids=...`. Kept as a plain string +
 * `.refine()` (not `z.coerce.*`), matching decision-status-query.dto.ts's
 * own note on why — zod-to-openapi cannot introspect a `ZodEffects`-wrapped
 * transform and crashes OpenAPI doc generation at startup.
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
            ids.length <= MAX_BATCH_BY_IDS &&
            ids.every((id) => z.string().uuid().safeParse(id.trim()).success)
          );
        },
        {
          message: `ids: must be a comma-separated list of at most ${MAX_BATCH_BY_IDS} uuids`,
        },
      ),
  })
  .strict();

export type ByIdsQuery = z.infer<typeof byIdsQuerySchema>;
