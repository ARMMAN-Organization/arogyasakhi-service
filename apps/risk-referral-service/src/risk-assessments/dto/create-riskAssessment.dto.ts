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
// Mirrors risk-referral-service's own Prisma RiskPhase enum — kept as a
// literal list (not imported from the generated Prisma client) since DTOs
// in this service validate the wire shape independently of the ORM layer,
// same convention as this file's other enum-like fields.
const riskPhaseSchema = z.enum(['REGISTRATION', 'ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV']);

export const createRiskAssessmentSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    visitId: z.string().uuid().nullable(),
    submissionId: z.string().uuid(),
    ruleSetId: z.string().uuid(),
    // The caller's own formCode -> phase knowledge, needed to resolve this
    // rule pack's conditionCode -> risk_condition_id map (see
    // riskAssessment.service.ts's create()).
    riskPhase: riskPhaseSchema,
    answers: z.record(nestedJsonValueSchema),
    // The submission's actual completion date (date-only, YYYY-MM-DD) — the
    // caller's own submittedAt, needed to trigger automatic HR-visit
    // generation (SRS FR-S-5.2(b): "...15 days from the ACTUAL completion
    // date") when this evaluation detects an HR condition. Optional for
    // backward compatibility with any caller that doesn't have a visit
    // completion date (e.g. no real ANC_HR/INC_HR/CCV_HR generation is
    // attempted when omitted — see riskAssessment.service.ts's create()).
    actualCompletionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD), not a datetime')
      .optional(),
  })
  .strict();

export type CreateRiskAssessmentInput = z.infer<typeof createRiskAssessmentSchema>;
