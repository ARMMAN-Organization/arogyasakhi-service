import { z } from 'zod';

/**
 * Validation schema for POST /escalation-events. In production these rows
 * are raised by an automated rules/cron process, never a Sakhi/Supervisor
 * action — see escalation.routes.ts for why this is ADMIN-only rather than
 * following closures/reopen-requests/referrals' SAKHI-submitted convention.
 *
 * `status` is deliberately NOT a field here — every new escalation starts
 * OPEN, set server-side (escalation.service.ts), matching closures'
 * supervisorStatus convention of never trusting a client to set a
 * decision-bearing field directly. `.strict()` rejects unknown fields,
 * matching this repo's global convention.
 */
export const createEscalationEventSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    escalationType: z.enum([
      'ANC_2_MISSED',
      'ANC_HR_MISSED',
      'PP_MISSED',
      'PP_HR_MISSED',
      'NN_MISSED',
      'NN_HR_MISSED',
      'INC_2_MISSED',
      'INC_HR_MISSED',
      'CCV_MISSED',
      'CCV_HR_MISSED',
      'POST_EDD_MISSED',
      'DELIVERY_FORM_PENDING',
      'REFERRAL_FOLLOWUP_MISSED',
      'REFERRAL_INCOMPLETE',
      'TRANSFER_PENDING',
      'TRANSFER_APPROVAL_PENDING',
      'SYNC_DELAY',
      'CLOSURE_PENDING',
      'REOPEN_PENDING',
      'EDD_NEARING',
    ]),
    visitId: z.string().uuid().optional(),
    referralId: z.string().uuid().optional(),
    visitsMissedCount: z.number().int().optional(),
    assignedSupervisorId: z.string().uuid().optional(),
  })
  .strict();

export type CreateEscalationEventInput = z.infer<typeof createEscalationEventSchema>;
