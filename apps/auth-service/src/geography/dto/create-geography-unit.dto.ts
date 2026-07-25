import { z } from 'zod';

/**
 * Validation schema for creating a geography unit. Fields match
 * `geography_units` (docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md) —
 * `status`/audit columns are server-set, not client input. `.strict()` rejects
 * unknown fields, matching the repo's global convention. `parentId` is
 * required for every geoType except STATE — enforced in the service, not
 * here, since it depends on the parent's own geoType.
 */
export const createGeographyUnitSchema = z
  .object({
    parentId: z.string().uuid().optional(),
    geoType: z.enum(['STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA']),
    geoCode: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(180),
  })
  .strict();

export type CreateGeographyUnitInput = z.infer<typeof createGeographyUnitSchema>;
