import { z } from 'zod';

/** Caps a single setIds batch — matches list-riskAssessments.dto.ts's own cap. */
export const MAX_BATCH_RULE_SET_IDS = 50;

/**
 * Query schema for `GET /rules/published-content?setIds=...` — a mobile
 * client's full sync batch (SCHEDULE ×6 + RISK ×2 today) resolved in one
 * round trip instead of one `published-version` + `content` pair per rule
 * set. Kept as a plain string + `.refine()` (not `z.coerce.*`), matching
 * list-riskAssessments.dto.ts's own note on why — zod-to-openapi cannot
 * introspect a `ZodEffects`-wrapped transform and crashes OpenAPI doc
 * generation at startup.
 */
export const listPublishedContentQuerySchema = z
  .object({
    setIds: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const parts = v.split(',');
          return (
            parts.length <= MAX_BATCH_RULE_SET_IDS &&
            parts.every((p) => z.string().uuid().safeParse(p).success)
          );
        },
        {
          message: `setIds: must be a comma-separated list of at most ${MAX_BATCH_RULE_SET_IDS} uuids`,
        },
      ),
  })
  .strict();

export type ListPublishedContentQuery = z.infer<typeof listPublishedContentQuerySchema>;
