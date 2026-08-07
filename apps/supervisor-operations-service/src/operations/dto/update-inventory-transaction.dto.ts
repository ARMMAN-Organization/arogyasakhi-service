import { z } from 'zod';

/**
 * Partial update — only the fields that describe "what happened," not the
 * transaction's identity (itemId/sakhiId/projectId/supervisorId/
 * transactionType are immutable after creation, matching this repo's
 * append-only-ledger convention for audit-relevant records). At least one
 * field must be present.
 */
export const updateInventoryTransactionSchema = z
  .object({
    quantity: z.number().int().positive(),
    transactionDate: z.coerce.date(),
    remarks: z.string().trim().min(1).nullable(),
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
