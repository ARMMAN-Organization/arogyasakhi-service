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
      'PICKED_UP_TALKED',
      'PICKED_UP_NO_ONE_TALKING',
      'PICKED_UP_CUT_MIDWAY',
      'CALL_BACK',
      'NOT_PICKED_UP',
      'RINGING',
      'PHONE_OFF',
      'OUT_OF_NETWORK',
    ]),
    notes: z.string().trim().min(1).nullable(),
    followupAction: z.string().trim().min(1).nullable(),
    callEndAt: z.coerce.date(),
    callDurationSeconds: z.number().int().nonnegative(),
    responder: z
      .enum(['RELATIVE', 'HUSBAND', 'SAKHI', 'PERSON_WHO_DOES_NOT_KNOW_WOMAN'])
      .nullable(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  })
  .refine((data) => !data.callEndAt || data.callEndAt.getTime() <= Date.now(), {
    message: 'callEndAt must not be in the future.',
    path: ['callEndAt'],
  });

export type UpdateCallLogInput = z.infer<typeof updateCallLogSchema>;
