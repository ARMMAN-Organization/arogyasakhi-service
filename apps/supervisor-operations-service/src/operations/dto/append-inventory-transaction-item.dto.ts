import { z } from 'zod';
import { transactionItemSchema } from './create-inventory-transaction.dto';

/**
 * Validation schema for appending a new item line to an existing inventory
 * transaction group. Extends the same `itemId`/`quantity` shape used per
 * item in `createInventoryTransactionSchema`, plus an optional `remarks`.
 * `projectId`, `sakhiId`, `transactionType`, and `transactionDate` are
 * deliberately NOT fields here — a group represents one transaction event,
 * so those are always inherited from the group's existing rows (see
 * operations.service.ts), never re-specified by the client. `.strict()`
 * rejects any attempt to send them anyway.
 */
export const appendInventoryTransactionItemSchema = transactionItemSchema.extend({
  remarks: z.string().trim().min(1).optional(),
});

export type AppendInventoryTransactionItemInput = z.infer<
  typeof appendInventoryTransactionItemSchema
>;
