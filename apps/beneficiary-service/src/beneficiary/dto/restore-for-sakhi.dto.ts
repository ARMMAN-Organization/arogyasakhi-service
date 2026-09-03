import { z } from 'zod';

/**
 * Request body for `PATCH /beneficiaries/restore` — a server-to-server-only
 * bulk restore, undoing a soft-delete previously applied to every
 * beneficiary-family record (BeneficiaryPii, BeneficiaryCase,
 * MotherCaseDetails, ChildCaseDetails, ConsentRecord) owned by one Sakhi.
 * Scoped by `sakhiUserId` rather than an explicit id list because the
 * DATA_RESTORE approval flow this backs (approval-service's
 * decideDataRestoreCard) restores everything a deactivated Sakhi owned, not
 * a caller-chosen subset.
 */
export const restoreForSakhiSchema = z
  .object({
    sakhiUserId: z.string().uuid(),
  })
  .strict();

export type RestoreForSakhiInput = z.infer<typeof restoreForSakhiSchema>;
