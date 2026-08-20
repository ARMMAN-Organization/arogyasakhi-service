import { z } from 'zod';

/** Caps a single visitIds batch — matches list-risk-conditions.dto.ts's own cap. */
export const MAX_BATCH_VISIT_IDS = 100;

/**
 * Query schema for `GET /risk-assessments?beneficiaryId=...&visitIds=...` —
 * both required. Resolves to the RiskAssessment rows for exactly the given
 * visit ids, for a caller (e.g. visit-form-service's BR-13 resolver) that
 * already knows which visits it cares about — this service doesn't own
 * visit_instances/visit_schedules, so it can't resolve "the beneficiary's
 * last 3 INC visits" itself (no cross-service join per the forklift rule).
 * Kept as plain strings + `.refine()` (not `z.coerce.*`), matching
 * list-risk-conditions.dto.ts's own note on why — zod-to-openapi cannot
 * introspect a `ZodEffects`-wrapped transform and crashes OpenAPI doc
 * generation at startup. For the same reason, cross-field validation (both
 * fields present) belongs in the controller, not a whole-object `.refine()`
 * here — see list-risk-conditions.dto.ts's own comment on that trap.
 */
export const listRiskAssessmentsQuerySchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    visitIds: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const parts = v.split(',');
          return (
            parts.length <= MAX_BATCH_VISIT_IDS &&
            parts.every((p) => z.string().uuid().safeParse(p).success)
          );
        },
        {
          message: `visitIds: must be a comma-separated list of at most ${MAX_BATCH_VISIT_IDS} uuids`,
        },
      ),
  })
  .strict();

export type ListRiskAssessmentsQuery = z.infer<typeof listRiskAssessmentsQuerySchema>;
