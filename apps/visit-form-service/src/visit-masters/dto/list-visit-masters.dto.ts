import { z } from 'zod';

/** Caps a single lookup batch — matches list-risk-conditions.dto.ts's own cap. */
export const MAX_BATCH_VISIT_CODES = 100;

/**
 * Query schema for `GET /visit-masters?visitCode=...` — a comma-separated
 * batch of visit codes (e.g. "ANC1,PP3") to resolve to their full catalog
 * rows in one round trip. `visitCode` is optional: omitting it entirely
 * requests every ACTIVE visit master (the Supervisor app's "Download Master
 * Data" screen download), rather than a code-filtered batch lookup. Kept as
 * a plain string + `.refine()` (not `z.coerce.*`), matching
 * list-risk-conditions.dto.ts's own note on why — zod-to-openapi cannot
 * introspect a `ZodEffects`-wrapped transform and crashes OpenAPI doc
 * generation at startup.
 */
export const listVisitMastersQuerySchema = z
  .object({
    visitCode: z
      .string()
      .trim()
      .min(1)
      .refine((v) => v.split(',').length <= MAX_BATCH_VISIT_CODES, {
        message: `visitCode: must be a comma-separated list of at most ${MAX_BATCH_VISIT_CODES} codes`,
      })
      .optional(),
  })
  .strict();

export type ListVisitMastersQuery = z.infer<typeof listVisitMastersQuerySchema>;
