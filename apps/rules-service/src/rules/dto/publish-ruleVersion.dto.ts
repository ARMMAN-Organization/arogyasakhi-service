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
 * Validation schema for publishing a new rule pack version. The gorules payload
 * is an arbitrary JSON object (a decision graph); we only require it to be a
 * JSON object, not a bare scalar. `.strict()` rejects unknown top-level fields.
 */
export const publishRuleVersionSchema = z
  .object({
    rulesJson: z.record(nestedJsonValueSchema),
  })
  .strict();

export type PublishRuleVersionInput = z.infer<typeof publishRuleVersionSchema>;
