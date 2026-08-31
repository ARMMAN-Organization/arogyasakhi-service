import { forbidden, type AuthenticatedUser } from '@armman/service-commons';
import type { BeneficiaryClient } from './beneficiary.client';

/**
 * Shared SAKHI-owns-beneficiary ownership check for a referral, used by both
 * ReferralFollowupService.create and ReferralConversionService.convertToAccompanied
 * — extracted after PR #199 review flagged the identical findById -> 404,
 * beneficiaryClient.getById -> sakhiId mismatch -> 403 sequence being
 * copy-pasted verbatim between the two. Referrals carries no sakhiId column,
 * so ownership is always resolved via beneficiary-service.
 */
export async function assertSakhiOwnsReferral(
  referral: { beneficiaryId: string },
  caller: AuthenticatedUser,
  beneficiaryClient: BeneficiaryClient,
  authorizationHeader: string,
): Promise<void> {
  const beneficiary = await beneficiaryClient.getById(referral.beneficiaryId, authorizationHeader);
  if (!beneficiary || beneficiary.sakhiId !== caller.id) {
    throw forbidden('This referral does not belong to your own roster.');
  }
}
