import { z } from 'zod';
import { dateOnlySchema } from './create-visit-schedule-bulk.dto';

/**
 * Request body for `POST /visit-schedules/regenerate-anc` — triggered by
 * beneficiary-service's applyLmpChange after a Supervisor approves an
 * LMP_CHANGE request (FR-SV-4.2). registrationDate stays the beneficiary's
 * ORIGINAL registration date (ANC1 anchors to registration, not LMP —
 * FR-S-3.2); edd reflects the correction.
 */
export const regenerateAncScheduleSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    registrationDate: dateOnlySchema,
    edd: dateOnlySchema,
  })
  .strict();

export type RegenerateAncScheduleInput = z.infer<typeof regenerateAncScheduleSchema>;
