import { z } from 'zod';

/**
 * Request body for `PATCH /visits/restore` — a server-to-server-only bulk
 * restore, undoing a soft-delete previously applied to every visit/form
 * record owned by one Sakhi. Scoped by `sakhiUserId` (mirrors
 * beneficiary-service's restore-for-sakhi.dto.ts) rather than an explicit
 * id list because the DATA_RESTORE approval flow this backs restores
 * everything a deactivated Sakhi owned, not a caller-chosen subset.
 *
 * Only VisitSchedule/VisitInstance/VisitStatusHistory/FormSubmission/
 * FormAnswer are in scope — VisitMaster, FormDefinition, and FormVersion
 * are global reference/master data with no sakhiId or beneficiaryId of
 * their own, so a per-Sakhi restore has nothing to do to them.
 */
export const restoreForSakhiSchema = z
  .object({
    sakhiUserId: z.string().uuid(),
  })
  .strict();

export type RestoreForSakhiInput = z.infer<typeof restoreForSakhiSchema>;
