import { z } from 'zod';

/** Path params for `GET /beneficiaries/:beneficiaryId/risk-referrals`. */
export const beneficiaryRiskReferralsParamsSchema = z
  .object({ beneficiaryId: z.string().uuid() })
  .strict();

export type BeneficiaryRiskReferralsParams = z.infer<typeof beneficiaryRiskReferralsParamsSchema>;

/**
 * Path params for `GET /beneficiaries/:beneficiaryId/risk-referrals/:referralId/details`.
 * Both ids are validated together — `referralId` alone is not enough to look
 * up a referral; it must also belong to the `beneficiaryId` in the path (see
 * beneficiaryRiskReferral.service.ts's `getReferralDetails`).
 */
export const beneficiaryRiskReferralDetailsParamsSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    referralId: z.string().uuid(),
  })
  .strict();

export type BeneficiaryRiskReferralDetailsParams = z.infer<
  typeof beneficiaryRiskReferralDetailsParamsSchema
>;
