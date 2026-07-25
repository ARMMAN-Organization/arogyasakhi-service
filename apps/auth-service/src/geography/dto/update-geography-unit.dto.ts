import { z } from 'zod';

/**
 * Partial update — every field optional, but at least one must be present.
 * `parentId` and `geoType` are intentionally excluded: re-parenting or
 * changing a unit's level after creation risks orphaning its own children or
 * breaking the ancestor-chain walk elsewhere. Delete and recreate instead.
 */
export const updateGeographyUnitSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    geoCode: z.string().trim().min(1).max(80).nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

export type UpdateGeographyUnitInput = z.infer<typeof updateGeographyUnitSchema>;
