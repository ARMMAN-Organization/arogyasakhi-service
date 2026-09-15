import { z } from 'zod';

/**
 * Partial update — only the fields that describe "what happened" to a
 * transaction, not its identity (itemId/sakhiId/projectId/supervisorId are
 * still immutable after creation, matching this repo's append-only-ledger
 * convention). `transactionType` IS editable here — a deliberate exception
 * to that convention, so an edit-form correction (e.g. HANDOVER meant to be
 * RETURNED) is possible; note the ledger keeps no history of what a row's
 * transactionType previously was, only `updatedAt`/`updatedByUserId` that
 * something changed and who changed it. At least one field must be present.
 */
export const updateInventoryTransactionSchema = z
  .object({
    quantity: z.number().int().positive(),
    transactionDate: z.coerce.date(),
    remarks: z.string().trim().min(1).nullable(),
    transactionType: z.enum(['HANDOVER', 'RETURNED', 'PERMANENT_DAMAGED', 'MISPLACED', 'CONSUMED']),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  })
  .refine((data) => !data.transactionDate || data.transactionDate.getTime() <= Date.now(), {
    message: 'transactionDate must not be in the future.',
    path: ['transactionDate'],
  });

export type UpdateInventoryTransactionInput = z.infer<typeof updateInventoryTransactionSchema>;
