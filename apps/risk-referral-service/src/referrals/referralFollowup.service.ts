import { conflict, forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { ReferralFollowupRepository } from './referralFollowup.repository';
import type { ReferralRepository } from './referral.repository';
import type { BeneficiaryClient } from './beneficiary.client';
import type { CreateReferralFollowupInput } from './dto/create-referral-followup.dto';

/**
 * Referral follow-up submission (SRS FR-S-6.3, Appendix E.3): the Sakhi's
 * "did the beneficiary visit the facility?" answer. visitedFacilityFlag
 * true -> the referral is COMPLETED; false -> the follow-up is recorded as
 * INCOMPLETE but the referral stays PENDING_FOLLOWUP (Appendix E.4: an
 * incomplete follow-up routes to a Supervisor card, decided via the
 * existing PATCH/POST /referrals/:id/decision — not this endpoint).
 */
export class ReferralFollowupService {
  constructor(
    private readonly repository: ReferralFollowupRepository,
    private readonly referralRepository: ReferralRepository,
    private readonly beneficiaryClient: BeneficiaryClient,
  ) {}

  /**
   * A SAKHI caller may only submit a follow-up for a referral belonging to
   * their own beneficiary — unlike POST /referrals (creation), which has no
   * such check today (a deliberate, acknowledged gap left as-is; see this
   * feature's implementation plan doc). Referrals carries no sakhiId
   * column, so this is resolved via beneficiary-service.
   */
  async create(
    referralId: string,
    dto: CreateReferralFollowupInput,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const referral = await this.referralRepository.findById(referralId);
    if (!referral) throw notFound('Referral not found.');

    const beneficiary = await this.beneficiaryClient.getById(
      referral.beneficiaryId,
      authorizationHeader,
    );
    if (!beneficiary || beneficiary.sakhiId !== caller.id) {
      throw forbidden('This referral does not belong to your own roster.');
    }

    if (referral.status !== 'PENDING_FOLLOWUP') {
      throw conflict(`Cannot submit a follow-up for a referral with status ${referral.status}.`);
    }

    const followupStatus = dto.visitedFacilityFlag ? 'COMPLETED' : 'INCOMPLETE';
    const referralStatus = dto.visitedFacilityFlag ? 'COMPLETED' : 'PENDING_FOLLOWUP';

    return this.repository.create(referralId, followupStatus, referralStatus, dto, caller.id);
  }
}
