import { z } from 'zod';

/**
 * Partial update — only the fields captured after a call ends
 * (callEndAt/callDurationSeconds/callStatus/notes/followupAction). The
 * call's identity (sakhiId/projectId/callStartAt/callDatetime) is immutable
 * after creation, matching this repo's append-only-ledger convention for
 * audit-relevant records (see update-inventory-transaction.dto.ts). At least
 * one field must be present.
 */
export const updateCallLogSchema = z
  .object({
    callStatus: z.enum([
      'CONNECTED',
      'NOT_CONNECTED',
      'FOLLOWUP_REQUIRED',
      'BUSY',
      'SWITCHED_OFF',
      'WRONG_NUMBER',
    ]),
    notes: z.string().trim().min(1).nullable(),
    followupAction: z.string().trim().min(1).nullable(),
    callEndAt: z.coerce.date(),
    callDurationSeconds: z.number().int().nonnegative(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

export type UpdateCallLogInput = z.infer<typeof updateCallLogSchema>;
