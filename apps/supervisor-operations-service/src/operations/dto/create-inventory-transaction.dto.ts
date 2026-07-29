import { z } from 'zod';

/**
 * Validation schema for recording an inventory transaction. Per FR-SV-1.1, a
 * Supervisor selects a Program, then a Sakhi, then one or more items, then a
 * transaction type, date, and optional remarks in a single submission —
 * `items` is therefore an array, and the service creates one
 * `inventory_transactions` row per item (the schema stores one item+quantity
 * per row; there is no multi-item row shape to match the submission 1:1).
 * `.strict()` rejects unknown fields, matching the repo-wide convention.
 *
 * `supervisorId` is deliberately NOT a field here — it is always the
 * authenticated caller's own id (see operations.service.ts), never
 * client-supplied, so a Supervisor can never record a transaction under
 * another Supervisor's name.
 */
const transactionItemSchema = z
  .object({
    itemId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })
  .strict();

export const createInventoryTransactionSchema = z
  .object({
    projectId: z.string().uuid(),
    sakhiId: z.string().uuid(),
    transactionType: z.enum(['HANDOVER', 'RETURNED', 'PERMANENT_DAMAGED', 'MISPLACED', 'CONSUMED']),
    transactionDate: z.coerce.date(),
    remarks: z.string().trim().min(1).optional(),
    items: z.array(transactionItemSchema).min(1),
  })
  .strict();

export type CreateInventoryTransactionInput = z.infer<typeof createInventoryTransactionSchema>;
