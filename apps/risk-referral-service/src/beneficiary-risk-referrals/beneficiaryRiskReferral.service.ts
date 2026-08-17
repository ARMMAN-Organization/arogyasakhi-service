import { notFound } from '@armman/service-commons';
import type { BeneficiaryRiskReferralRepository } from './beneficiaryRiskReferral.repository';

/**
 * Assembles the header/detail split for a beneficiary's risk referrals for
 * the reference Android app's "Beneficiary Data Download" screen. Not part
 * of the SRS/ERD/HLD; reverse engineered from that reference app. A pure
 * read projection over this service's own `referrals`/`referral_followups`/
 * `Referral_trigger_sources` tables — the split this download wants already
 * exists structurally via `Referral.referralFollowups`/`referralTriggerSources`,
 * so no new models were needed.
 */
export class BeneficiaryRiskReferralService {
  constructor(private readonly repository: BeneficiaryRiskReferralRepository) {}

  /**
   * "Header" list for the beneficiary — deliberately excludes followups/
   * trigger sources (that's what makes `getReferralDetails` a separate
   * call). Does not check whether the beneficiary itself exists (see
   * beneficiaryRisk.service.ts's identical rationale) — an unknown/foreign
   * beneficiaryId simply yields an empty list rather than a 404.
   */
  listReferrals(beneficiaryId: string) {
    return this.repository.findHeadersByBeneficiary(beneficiaryId);
  }

  /**
   * A single referral's followups + trigger sources. 404s when the referral
   * doesn't exist, or exists but belongs to a different beneficiaryId than
   * the one in the path — the repository query already scopes on both ids
   * together, so both cases surface identically here.
   */
  async getReferralDetails(beneficiaryId: string, referralId: string) {
    const referral = await this.repository.findDetailsById(beneficiaryId, referralId);
    if (!referral) throw notFound('Referral not found.');

    return {
      referralId: referral.id,
      followups: referral.referralFollowups,
      triggerSources: referral.referralTriggerSources,
    };
  }
}
