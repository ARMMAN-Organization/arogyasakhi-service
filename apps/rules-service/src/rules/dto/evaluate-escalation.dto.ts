import { z } from 'zod';

/**
 * Request body for `POST /rules/:setId/evaluate-escalation`. Unlike
 * evaluate-schedule.dto.ts's generic JSON-blob `input` (which varies per
 * scheduleKind), ESCALATION's input shape is fixed across every visitFamily
 * (SRS §3A.2.7 FR-S-7.1), so it gets a properly typed schema instead of a
 * recursive JSON-value union.
 */
export const evaluateEscalationSchema = z
  .object({
    input: z
      .object({
        visitFamily: z.string(),
        isHrVisit: z.boolean(),
        consecutiveMissedCount: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export type EvaluateEscalationInput = z.infer<typeof evaluateEscalationSchema>;
