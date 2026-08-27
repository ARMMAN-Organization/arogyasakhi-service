import {
  badGateway,
  conflict,
  forbidden,
  notFound,
  type AuthenticatedUser,
} from '@armman/service-commons';
import type { ReferralRepository } from './referral.repository';
import type { BeneficiaryClient } from './beneficiary.client';
import { resolveReferralTypeLookupId } from './lookup.client';

/**
 * Standard -> Accompanied referral conversion (SRS FR-S-6.3, Appendix E.2:
 * "no extension of window" — conversion must complete within the original
 * 7-day validTill, never grants a new one). Bharath's referral-lifecycle
 * request, 2026-08-27, item #5.
 */
export class ReferralConversionService {
  constructor(
    private readonly repository: ReferralRepository,
    private readonly beneficiaryClient: BeneficiaryClient,
  ) {}

  /**
   * Same SAKHI-owns-beneficiary ownership check as
   * ReferralFollowupService.create — referrals carries no sakhiId column,
   * so this is resolved via beneficiary-service.
   */
  async convertToAccompanied(
    referralId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const referral = await this.repository.findById(referralId);
    if (!referral) throw notFound('Referral not found.');

    const beneficiary = await this.beneficiaryClient.getById(
      referral.beneficiaryId,
      authorizationHeader,
    );
    if (!beneficiary || beneficiary.sakhiId !== caller.id) {
      throw forbidden('This referral does not belong to your own roster.');
    }

    if (referral.status !== 'PENDING_FOLLOWUP') {
      throw conflict(`Cannot convert a referral with status ${referral.status}.`);
    }

    const accompaniedLookupValueId = await resolveReferralTypeLookupId(
      'ACCOMPANIED',
      authorizationHeader,
    );
    if (!accompaniedLookupValueId) {
      throw badGateway(
        'Unable to resolve the ACCOMPANIED referral type — cannot convert this referral.',
      );
    }
    if (referral.referralTypeLookupValueId === accompaniedLookupValueId) {
      throw conflict('This referral is already Accompanied.');
    }

    // No new window is granted on conversion — validTill was already fixed
    // at creation (referralDate + 7 days, see ReferralService.create) and
    // is never recomputed here.
    if (!referral.validTill || referral.validTill.getTime() < Date.now()) {
      throw conflict('This referral can no longer be converted — its 7-day window has closed.');
    }

    const converted = await this.repository.updateType(
      referralId,
      referral.referralTypeLookupValueId,
      accompaniedLookupValueId,
    );
    if (!converted) {
      // Raced with another decision/conversion between the read above and
      // this conditional update — same outcome as the checks above, just
      // caught a beat later instead of trusting a stale read.
      throw conflict('This referral was changed by another request. Please retry.');
    }

    const result = await this.repository.findById(referralId);
    if (!result) throw notFound('Referral not found.');
    return result;
  }
}
