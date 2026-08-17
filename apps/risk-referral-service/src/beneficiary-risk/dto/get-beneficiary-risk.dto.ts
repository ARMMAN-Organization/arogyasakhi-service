import { z } from 'zod';

/**
 * Path params for `GET /beneficiaries/:beneficiaryId/risk`. `.strict()`
 * rejects any unexpected param, matching every other params schema in this
 * service (see referral.controller.ts's `referralIdParamsSchema`).
 */
export const beneficiaryRiskParamsSchema = z.object({ beneficiaryId: z.string().uuid() }).strict();

export type BeneficiaryRiskParams = z.infer<typeof beneficiaryRiskParamsSchema>;
