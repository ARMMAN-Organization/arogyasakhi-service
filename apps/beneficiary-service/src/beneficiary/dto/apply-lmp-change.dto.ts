import { z } from 'zod';

/**
 * Body for `PATCH /beneficiaries/:id/lmp` — applies an approved LMP change
 * (FR-SV-4.2). Called server-to-server by approval-service once a Supervisor
 * approves an LMP_CHANGE Quick Response card, never directly by a Sakhi.
 *
 * eddDate is recomputed here from lmpDate (same GESTATION_DAYS formula used
 * at registration — see BeneficiaryService.create), not accepted from the
 * caller, so lmpDate/eddDate can never drift out of sync.
 *
 * Does NOT regenerate the ANC visit schedule — schedules are generated
 * offline on the Sakhi's device (FR-S-2.2) and uploaded via
 * POST /visit-schedules/bulk; this service has no schedule-generation logic
 * to trigger. Regenerating the schedule after an LMP change is the Sakhi
 * app's responsibility on next sync, not this endpoint's.
 */
export const applyLmpChangeSchema = z
  .object({
    lmpDate: z.coerce.date(),
  })
  .strict();

export type ApplyLmpChangeInput = z.infer<typeof applyLmpChangeSchema>;
