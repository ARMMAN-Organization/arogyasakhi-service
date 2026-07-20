import { z } from 'zod';

/**
 * Partial update for a lookup value. `lookupCategoryId` is deliberately not
 * accepted here — moving a value between categories would break the
 * category-scoped `parentLookupValueId` invariant, so category reassignment
 * is out of scope for this endpoint.
 */
export const updateLookupValueSchema = z
  .object({
    valueLabel: z.string().trim().min(1).max(160),
    sortOrder: z.number().int().min(0),
    parentLookupValueId: z.string().uuid().nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

export type UpdateLookupValueInput = z.infer<typeof updateLookupValueSchema>;
