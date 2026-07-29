import { z } from 'zod';

/**
 * Validation schema for creating an inventory item (consumables/instruments
 * master data, ERD §4.7 inventory_items). ADMIN-only — this is centrally
 * managed catalog data, not something recorded per-transaction.
 * `.strict()` rejects unknown fields, matching the repo-wide convention.
 */
export const createInventoryItemSchema = z
  .object({
    itemCode: z.string().trim().min(1).max(80),
    itemName: z.string().trim().min(1).max(160),
    itemCategory: z.enum(['CONSUMABLE', 'INSTRUMENT']),
    unit: z.string().trim().min(1).max(30),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .strict();

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
