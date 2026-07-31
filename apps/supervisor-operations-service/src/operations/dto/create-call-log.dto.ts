import { z } from 'zod';

/**
 * Validation schema for logging a call (FR-SV-3.1/3.2, ERD §4.7 call_logs).
 * `.strict()` rejects unknown fields, matching the repo-wide convention.
 *
 * `supervisorId` is deliberately NOT a field here — it is always the
 * authenticated caller's own id (see operations.service.ts), never
 * client-supplied, so a Supervisor can never log a call under another
 * Supervisor's name.
 *
 * `callDurationSeconds` is optional here (unlike on update) — per
 * FR-SV-3.2's own start/end split, duration is realistically only known
 * once the call has ended, so it's set via PATCH, not required at creation.
 */
export const createCallLogSchema = z
  .object({
    projectId: z.string().uuid(),
    sakhiId: z.string().uuid(),
    callDatetime: z.coerce.date(),
    callStatus: z.enum([
      'CONNECTED',
      'NOT_CONNECTED',
      'FOLLOWUP_REQUIRED',
      'BUSY',
      'SWITCHED_OFF',
      'WRONG_NUMBER',
    ]),
    notes: z.string().trim().min(1).optional(),
    followupAction: z.string().trim().min(1).optional(),
    callStartAt: z.coerce.date(),
    callEndAt: z.coerce.date().optional(),
    callDurationSeconds: z.number().int().nonnegative().optional(),
  })
  .strict();

export type CreateCallLogInput = z.infer<typeof createCallLogSchema>;
