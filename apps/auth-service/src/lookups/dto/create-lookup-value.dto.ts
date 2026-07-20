import { z } from 'zod';

/**
 * Validation schema for adding a value to an existing lookup category.
 * `lookupCategoryId` is taken from the route (`:categoryCode`), not the
 * body — a value can never be created detached from a category.
 */
export const createLookupValueSchema = z
  .object({
    valueCode: z.string().trim().min(1).max(80),
    valueLabel: z.string().trim().min(1).max(160),
    sortOrder: z.number().int().min(0).optional(),
    parentLookupValueId: z.string().uuid().optional(),
  })
  .strict();

export type CreateLookupValueInput = z.infer<typeof createLookupValueSchema>;
