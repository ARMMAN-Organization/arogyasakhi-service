import { z } from 'zod';

/**
 * Validation schema for GET /quick-response query params. `status` defaults
 * to PENDING per the Quick Response spec — resolved against APPROVAL_STATUS
 * lookup values for approval_requests, and mapped to escalation_events'
 * OPEN status for escalation-sourced cards (escalation_events has no
 * PENDING value of its own).
 */
export const listQuickResponseSchema = z
  .object({
    status: z.string().trim().min(1).default('PENDING'),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListQuickResponseInput = z.infer<typeof listQuickResponseSchema>;
