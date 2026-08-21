import { z } from 'zod';

/**
 * Body for `PATCH /supervisors/:userId/manager` — links a Supervisor to the
 * Manager who resolves FR-SV-4.3's "designated Manager" for her Sakhis'
 * Missed Visit Escalation transfers. ADMIN-only; there is no bulk/self-serve
 * path yet — org hierarchy data entry, one Supervisor at a time.
 */
export const setManagerSchema = z
  .object({
    managerUserId: z.string().uuid(),
  })
  .strict();

export type SetManagerInput = z.infer<typeof setManagerSchema>;
