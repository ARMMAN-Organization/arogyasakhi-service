import { z } from 'zod';
import { SCHEDULE_KINDS } from '../scheduleEvaluator';

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
 * Request body for `POST /rules/:setId/evaluate-schedule`. `scheduleKind`
 * tells scheduleEvaluator.ts which of the seven output contracts to
 * validate against — it is supplied by the caller (who knows which journey
 * this rule set represents), not inferred from the rule set row itself,
 * since RuleSet has no scheduleKind column (only the generic
 * RuleCategory.SCHEDULE). `input` is the arbitrary JSON context fed to the
 * decision graph (registrationDate/edd for ANC, dob/registrationDate for
 * INC, etc.) — shape is defined by whichever rulesJson pack is published.
 */
export const evaluateScheduleSchema = z
  .object({
    scheduleKind: z.enum(SCHEDULE_KINDS),
    input: z.record(nestedJsonValueSchema),
  })
  .strict();

export type EvaluateScheduleInput = z.infer<typeof evaluateScheduleSchema>;
