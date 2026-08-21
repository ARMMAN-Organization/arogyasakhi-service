import { z } from 'zod';

/**
 * Body for `POST /supervisors/manager-transfer-notice` — the Missed Visit
 * Escalation TRANSFER email (FR-SV-4.3: "Email sent to designated Manager
 * with Sakhi and beneficiary details"). Called server-to-server by
 * notification-escalation-service's decideMissedVisit, which already holds
 * these fields from its own row plus beneficiary-service's GET
 * /beneficiaries/:id — the Sakhi's own displayName is resolved here instead
 * (this service owns it), not passed in.
 */
export const sendTransferNoticeSchema = z
  .object({
    sakhiId: z.string().uuid(),
    beneficiaryName: z.string().trim().min(1).max(200),
    visitsMissedCount: z.number().int().positive().nullable(),
    visitType: z.string().trim().min(1).max(20),
  })
  .strict();

export type SendTransferNoticeInput = z.infer<typeof sendTransferNoticeSchema>;
