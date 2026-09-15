import { z } from 'zod';

/**
 * Validation schema for appending a new item line to an existing inventory
 * transaction group. `projectId`, `sakhiId`, `transactionType`, and
 * `transactionDate` are deliberately NOT fields here — a group represents
 * one transaction event, so those are always inherited from the group's
 * existing rows (see operations.service.ts), never re-specified by the
 * client. `.strict()` rejects any attempt to send them anyway.
 */
export const appendInventoryTransactionItemSchema = z
  .object({
    itemId: z.string().uuid(),
    quantity: z.number().int().positive(),
    remarks: z.string().trim().min(1).optional(),
  })
  .strict();

export type AppendInventoryTransactionItemInput = z.infer<
  typeof appendInventoryTransactionItemSchema
>;
