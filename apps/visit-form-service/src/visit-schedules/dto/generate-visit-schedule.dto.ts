import { z } from 'zod';
import { dateOnlySchema } from './create-visit-schedule-bulk.dto';

/**
 * The six SCHEDULE_KINDS (rules-service) this endpoint can generate. CCV is
 * excluded — it is already evaluated server-side via
 * ccvOpeningRiskState.resolver.ts, but only for a risk-tier flag, not for
 * dates; folding it into this endpoint too would create two competing
 * callers of the same rule pack for two different purposes.
 *
 * Each variant's `input` fields mirror EXACTLY what that journey's own
 * rulesJson pack destructures (apps/rules-service/src/rules/scheduling/
 * *.rulesJson.ts) — not a generic "every field, all optional" shape. That
 * generic shape was tried first and found wrong by live verification: NN
 * needs deliveryDate/deliveryFormFiledDate (not dob/registrationDate), HR
 * needs phase/hrDetectedThisVisit/actualCompletionDate (unrelated to any
 * other journey's fields), and DELIVERY needs deliveryOutcome/
 * motherEnrollmentType/numberOfChildren on top of the delivery dates — a
 * caller sending the "usual" date fields for these three got a 502 from
 * rules-service's own handler-level validation, not a helpful 400 naming
 * the missing field.
 */
export const generateVisitScheduleSchema = z.discriminatedUnion('scheduleKind', [
  z.object({
    beneficiaryId: z.string().uuid(),
    scheduleKind: z.literal('ANC'),
    registrationDate: dateOnlySchema,
    edd: dateOnlySchema,
    deliveryFormFiledDate: dateOnlySchema.nullable(),
  }),
  z.object({
    beneficiaryId: z.string().uuid(),
    scheduleKind: z.literal('PP'),
    deliveryDate: dateOnlySchema,
  }),
  z.object({
    beneficiaryId: z.string().uuid(),
    scheduleKind: z.literal('NN'),
    deliveryDate: dateOnlySchema,
    deliveryFormFiledDate: dateOnlySchema,
  }),
  z.object({
    beneficiaryId: z.string().uuid(),
    scheduleKind: z.literal('INC'),
    dob: dateOnlySchema,
    registrationDate: dateOnlySchema,
  }),
  z.object({
    beneficiaryId: z.string().uuid(),
    scheduleKind: z.literal('HR'),
    phase: z.enum(['ANC', 'INC', 'CCV']),
    hrDetectedThisVisit: z.boolean(),
    actualCompletionDate: dateOnlySchema,
  }),
  z.object({
    beneficiaryId: z.string().uuid(),
    scheduleKind: z.literal('DELIVERY'),
    deliveryOutcome: z.enum(['LIVE_BIRTH', 'STILLBIRTH']),
    motherEnrollmentType: z.enum(['ANC_ENROLLED', 'DIRECT']),
    numberOfChildren: z.number().int().positive(),
    deliveryDate: dateOnlySchema,
    deliveryFormFiledDate: dateOnlySchema,
  }),
]);

export type GenerateVisitScheduleInput = z.infer<typeof generateVisitScheduleSchema>;
export type GeneratableScheduleKind = GenerateVisitScheduleInput['scheduleKind'];
