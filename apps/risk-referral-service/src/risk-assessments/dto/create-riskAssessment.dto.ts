import { z } from 'zod';

/** Recursive JSON value type usable inside nested objects/arrays. */
type NestedJsonValue =
  string | number | boolean | null | NestedJsonValue[] | { [key: string]: NestedJsonValue };

const nestedJsonValueSchema: z.ZodType<NestedJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(nestedJsonValueSchema),
    z.record(nestedJsonValueSchema),
  ]),
);

/**
 * Request body for `POST /risk-assessments` — called by visit-form-service
 * after persisting a visit-linked, VALID form submission. `ruleSetId` is
 * read by the caller from its own FormDefinition.riskRuleSetId (see that
 * column's schema comment) — this service has no form/entity knowledge of
 * its own to derive it. `visitId` is nullable since a submission need not
 * always be visit-linked (mirrors form_submissions.visitId).
 */
export const createRiskAssessmentSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    visitId: z.string().uuid().nullable(),
    submissionId: z.string().uuid(),
    ruleSetId: z.string().uuid(),
    answers: z.record(nestedJsonValueSchema),
  })
  .strict();

export type CreateRiskAssessmentInput = z.infer<typeof createRiskAssessmentSchema>;
