import { forbidden, type AuthenticatedUser } from '@armman/service-commons';
import type { BeneficiaryCaseRecord, BeneficiaryClient } from './beneficiary.client';

/**
 * Shared SAKHI-owns-beneficiary ownership check for a referral, used by both
 * ReferralFollowupService.create and ReferralConversionService.convertToAccompanied
 * — extracted after PR #199 review flagged the identical findById -> 404,
 * beneficiaryClient.getById -> sakhiId mismatch -> 403 sequence being
 * copy-pasted verbatim between the two. Referrals carries no sakhiId column,
 * so ownership is always resolved via beneficiary-service.
 *
 * Returns the resolved beneficiary record so callers that also need
 * `caseType` (e.g. ReferralFollowupService.create, for entityType/childId —
 * SRS 3C.4.1) don't need a second round trip to beneficiary-service.
 */
export async function assertSakhiOwnsReferral(
  referral: { beneficiaryId: string },
  caller: AuthenticatedUser,
  beneficiaryClient: BeneficiaryClient,
  authorizationHeader: string,
): Promise<BeneficiaryCaseRecord> {
  const beneficiary = await beneficiaryClient.getById(referral.beneficiaryId, authorizationHeader);
  if (!beneficiary || beneficiary.sakhiId !== caller.id) {
    throw forbidden('This referral does not belong to your own roster.');
  }
  return beneficiary;
}
