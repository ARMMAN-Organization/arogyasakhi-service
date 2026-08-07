import { z } from 'zod';

const bulkUpsertLookupValueItemSchema = z
  .object({
    valueCode: z.string().trim().min(1).max(80),
    valueLabel: z.string().trim().min(1).max(160),
    sortOrder: z.number().int().min(0).optional(),
    // Omitted = leave the existing parent alone (create path: no parent);
    // null = explicitly clear an existing value's parent — same
    // omitted-vs-null distinction as update-lookup-value.dto.ts, needed here
    // too since "this value should no longer be a child of anything" is a
    // legitimate reconciliation case.
    parentLookupValueId: z.string().uuid().nullable().optional(),
  })
  .strict();

/**
 * Validation schema for reconciling a whole category's values in one call —
 * e.g. an environment whose lookup master data has drifted from the current
 * form schema. Creates any valueCode not already in the category, updates
 * valueLabel/sortOrder/parentLookupValueId on any that exist and differ, and
 * leaves every value not mentioned in the payload untouched (additive/
 * updating only — this endpoint never deletes or deactivates a value).
 */
export const bulkUpsertLookupValuesSchema = z
  .object({
    values: z.array(bulkUpsertLookupValueItemSchema).min(1),
  })
  .strict()
  .refine((data) => new Set(data.values.map((v) => v.valueCode)).size === data.values.length, {
    message: 'valueCode must be unique within the payload.',
    path: ['values'],
  });

export type BulkUpsertLookupValuesInput = z.infer<typeof bulkUpsertLookupValuesSchema>;
