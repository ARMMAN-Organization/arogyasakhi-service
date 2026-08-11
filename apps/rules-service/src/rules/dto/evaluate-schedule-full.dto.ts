import { z } from 'zod';

/**
 * Request body for `POST /rules/:setId/evaluate-schedule/anc-full` — the
 * full ANC schedule (visit-count formula, ANC1, chained ANC2..N) in one
 * call, wrapping scheduleOrchestrator.ts's generateAncSchedule. Distinct
 * from the generic evaluate-schedule endpoint (one candidate visit per
 * call) — this is the single production consumer that needs the whole
 * sequence at once (LMP/EDD-change regeneration).
 */
export const evaluateScheduleFullSchema = z
  .object({
    registrationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)'),
    edd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)'),
  })
  .strict();

export type EvaluateScheduleFullInput = z.infer<typeof evaluateScheduleFullSchema>;
