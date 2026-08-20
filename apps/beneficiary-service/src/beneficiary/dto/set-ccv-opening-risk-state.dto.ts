import { z } from 'zod';
import { CCV_OPENING_RISK_STATES } from '../beneficiary.constants';

/**
 * Body for `PATCH /beneficiaries/:id/ccv-opening-risk-state` — writes
 * ChildCaseDetails.ccvOpeningRiskState once, at the INC->CCV transition
 * (BR-13: "risk state is evaluated exactly once, at the 12-month INC-to-CCV
 * transition"). Called server-to-server by visit-form-service immediately
 * after its own PATCH .../phase call advances the case to CCV, forwarding
 * the submitting SAKHI's own token (this codebase has no machine/
 * service-account identity — same pattern as PATCH .../phase).
 */
export const setCcvOpeningRiskStateSchema = z
  .object({
    ccvOpeningRiskState: z.enum(CCV_OPENING_RISK_STATES),
  })
  .strict();

export type SetCcvOpeningRiskStateInput = z.infer<typeof setCcvOpeningRiskStateSchema>;
