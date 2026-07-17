import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries`, per SRS FR-S-9.2 ("Search by name
 * and mobile number. Filter by pada (multi-select) and risk level
 * (multi-select)") and the HLD's endpoint table ("List beneficiaries with
 * filters (project, geography, status, case type, risk)"). Only single-value
 * filters are supported for now — multi-select would need an `[]` query
 * shape, not modeled here since no caller needs it yet.
 */
export const listBeneficiariesQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
    villageId: z.string().uuid().optional(),
    padaId: z.string().uuid().optional(),
    status: z
      .enum(['ACTIVE', 'JOURNEY_COMPLETE', 'CLOSED', 'TRANSFERRED', 'REOPEN_REQUESTED'])
      .optional(),
    caseType: z.enum(['MOTHER', 'CHILD']).optional(),
    atRiskOnly: z.coerce.boolean().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    mobileNumber: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export type ListBeneficiariesQueryInput = z.infer<typeof listBeneficiariesQuerySchema>;
