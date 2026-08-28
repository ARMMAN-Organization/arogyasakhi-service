import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries/risk-condition-summary`.
 * `beneficiaryIds` is a comma-separated list, kept as a plain string (not
 * `.transform()`ed) for the same reason as `by-ids-with-risk-query.dto.ts`'s
 * `ids` — `createDocumentedRouter()` cannot introspect a ZodEffects as an
 * OpenAPI parameter object. Split into an array in the controller via
 * `parseIdsParam` (reused from by-ids-with-risk-query.dto.ts, same shape).
 */
export const batchRiskConditionSummaryQuerySchema = z
  .object({
    beneficiaryIds: z.string().trim().min(1),
  })
  .strict();

export type BatchRiskConditionSummaryQueryInput = z.infer<
  typeof batchRiskConditionSummaryQuerySchema
>;
