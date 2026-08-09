import { z } from 'zod';

/** Caps a single lookup batch — matches call-sheet-stats.dto.ts's own cap. */
export const MAX_BATCH_CONDITION_CODES = 100;

/**
 * Query schema for `GET /risk-conditions?conditionCode=...` — a comma
 * separated batch of condition codes to resolve to riskConditionIds in one
 * round trip. Kept as a plain string + `.refine()` (not `z.coerce.*`),
 * matching list-call-sheet-stats-batch.dto.ts's own note on why —
 * zod-to-openapi cannot introspect a `ZodEffects`-wrapped transform and
 * crashes OpenAPI doc generation at startup.
 */
export const listRiskConditionsQuerySchema = z
  .object({
    conditionCode: z
      .string()
      .trim()
      .min(1)
      .refine((v) => v.split(',').length <= MAX_BATCH_CONDITION_CODES, {
        message: `conditionCode: must be a comma-separated list of at most ${MAX_BATCH_CONDITION_CODES} codes`,
      }),
  })
  .strict();

export type ListRiskConditionsQuery = z.infer<typeof listRiskConditionsQuerySchema>;
