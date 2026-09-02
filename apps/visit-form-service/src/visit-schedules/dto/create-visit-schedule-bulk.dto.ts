import { z } from 'zod';

export const MAX_BULK_SCHEDULE_ROWS = 100;

/**
 * Strict `YYYY-MM-DD` — schema/window dates are `@db.Date` (no time
 * component), so a full ISO datetime string (e.g.
 * "2026-08-04T00:00:00Z") is rejected rather than silently truncated. A
 * timezone-bearing timestamp could shift the stored date by a day depending
 * on the sender's offset, and a real visit landing on the wrong day is worse
 * than a clear 400 telling the client to send a date-only string.
 *
 * Deliberately NOT a `.transform()` — this repo has no precedent for a
 * custom `z.transform()` inside a request body schema that also feeds
 * createDocumentedRouter()'s OpenAPI generation, and zod-to-openapi cannot
 * introspect one (it crashes the whole service at startup with
 * `UnknownZodTypeError`, not a per-request error). The string stays a
 * string through validation; toDateOnly() below converts it afterwards, in
 * visitSchedule.service.ts, once the shape is already known-good.
 */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD), not a datetime');

/** Converts an already-validated dateOnlySchema string to a UTC midnight Date. */
export function toDateOnly(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

const visitCodeTypeSchema = z.enum([
  'ANC',
  'ANC_HR',
  'ANC_POST_EDD',
  'DELIVERY',
  'PP',
  'PP_HR',
  'NN',
  'NN_HR',
  'INC',
  'INC_HR',
  'CCV',
  'CCV_HR',
]);

const anchorTypeSchema = z.enum([
  'REGISTRATION',
  'LMP',
  'EDD',
  'DELIVERY_DATE',
  'DOB',
  'ACTUAL_VISIT',
  'CCV_TRANSITION',
]);

/**
 * One schedule row within a bulk upload. `visitCode`'s trailing digits (e.g.
 * "3" in "ANC3") must agree with `sequenceNo` — enforced in
 * visitSchedule.service.ts, not here, since it needs the parsed `sequenceNo`
 * value to compare against.
 */
export const bulkScheduleRowSchema = z
  .object({
    localScheduleUuid: z.string().trim().min(1).max(80),
    visitCode: z.string().trim().min(1).max(40),
    visitType: visitCodeTypeSchema,
    sequenceNo: z.number().int().positive(),
    scheduledDate: dateOnlySchema,
    windowStartDate: dateOnlySchema,
    windowEndDate: dateOnlySchema,
    anchorType: anchorTypeSchema,
    anchorVisitLocalUuid: z.string().trim().min(1).max(80).nullable(),
  })
  .strict()
  .refine((row) => row.windowStartDate <= row.windowEndDate, {
    message: 'windowStartDate must be on or before windowEndDate',
    path: ['windowEndDate'],
  });

// schedules has no upper bound here — a >100-row batch must fail with 413
// (payloadTooLarge), not the 400 Zod would raise via .max(). The size check
// runs first, in visitSchedule.service.ts, before this schema even sees the
// body.
export const createVisitScheduleBulkSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    generatedByRuleVersionId: z.string().uuid(),
    schedules: z.array(bulkScheduleRowSchema).min(1),
  })
  .strict();

export type CreateVisitScheduleBulkInput = z.infer<typeof createVisitScheduleBulkSchema>;
export type BulkScheduleRow = z.infer<typeof bulkScheduleRowSchema>;
