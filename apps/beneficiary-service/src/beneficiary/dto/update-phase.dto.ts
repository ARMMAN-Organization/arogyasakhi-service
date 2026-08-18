import { z } from 'zod';
import { CASE_PHASES } from '../beneficiary.constants';

/**
 * Body for `PATCH /beneficiaries/:id/phase` — advances a case's currentPhase
 * (CR-041). Called server-to-server by visit-form-service on a DELIVERY_VISIT
 * submission: once for the mother (phase: 'PP') and once per auto-created
 * child (phase: 'NN'), forwarding the submitting Sakhi's own token (this
 * codebase has no machine/service-account identity — same pattern as
 * PATCH /beneficiaries/:id/risk-condition-summary).
 *
 * Only the transitions BeneficiaryService.applyPhaseChange actually allows
 * (ANC->PP for a MOTHER case, *->NN for a CHILD case) succeed — any other
 * value is rejected there with a 409, not here; this schema only checks the
 * value is a real CasePhase.
 */
export const updatePhaseSchema = z
  .object({
    phase: z.enum(CASE_PHASES),
  })
  .strict();

export type UpdatePhaseInput = z.infer<typeof updatePhaseSchema>;
