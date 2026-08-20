import { z } from 'zod';

/** Caps a single lookup batch — matches call-sheet-stats.dto.ts's own cap. */
export const MAX_BATCH_CONDITION_CODES = 100;

/**
 * Query schema for `GET /risk-conditions?conditionCode=...` or
 * `?ids=...` — each a comma separated batch (of condition codes, or
 * riskConditionIds respectively) resolved to full rows in one round trip.
 * Exactly one of `conditionCode`/`ids` may be given (or neither, requesting
 * every ACTIVE risk condition — a master-data download); giving both is
 * rejected as ambiguous — enforced in riskCondition.controller.ts, NOT here
 * via a top-level `.refine()` on the whole object, which would wrap the
 * schema in `ZodEffects<ZodObject>` — zod-to-openapi cannot introspect that
 * shape and crashes OpenAPI doc generation at startup (same class of issue
 * as get-master-data-deltas.dto.ts's own note; a `.refine()` on an
 * individual field's `ZodOptional<ZodString>`, as done below, is fine — only
 * a whole-object wrap breaks it). Kept as plain strings + `.refine()` (not
 * `z.coerce.*`), matching list-call-sheet-stats-batch.dto.ts's own note on
 * why.
 */
export const listRiskConditionsQuerySchema = z
  .object({
    conditionCode: z
      .string()
      .trim()
      .min(1)
      .refine((v) => v.split(',').length <= MAX_BATCH_CONDITION_CODES, {
        message: `conditionCode: must be a comma-separated list of at most ${MAX_BATCH_CONDITION_CODES} codes`,
      })
      .optional(),
    // riskConditionId batch — used by other services (e.g. beneficiary-service
    // resolving BeneficiaryRiskConditionSummary.riskConditionId to a display
    // name) that hold the id, not the stable conditionCode.
    ids: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const parts = v.split(',');
          return (
            parts.length <= MAX_BATCH_CONDITION_CODES &&
            parts.every((p) => z.string().uuid().safeParse(p).success)
          );
        },
        {
          message: `ids: must be a comma-separated list of at most ${MAX_BATCH_CONDITION_CODES} uuids`,
        },
      )
      .optional(),
  })
  .strict();

export type ListRiskConditionsQuery = z.infer<typeof listRiskConditionsQuerySchema>;
