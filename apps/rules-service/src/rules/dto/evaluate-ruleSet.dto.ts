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
 * Request body for `POST /rules/:setId/evaluate` — an arbitrary JSON object
 * of answers/observed values, fed to the published rule version's gorules
 * decision graph as its evaluation context. Shape is defined by whatever the
 * decision graph itself expects; this service is a generic GoRules executor,
 * not risk-domain-aware.
 */
export const evaluateRuleSetSchema = z
  .object({
    answers: z.record(nestedJsonValueSchema),
  })
  .strict();

export type EvaluateRuleSetInput = z.infer<typeof evaluateRuleSetSchema>;
