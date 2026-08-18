import { forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { BeneficiaryRiskReferralRepository } from './beneficiaryRiskReferral.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';

/**
 * Assembles the header/detail split for a beneficiary's risk referrals for
 * the reference Android app's "Beneficiary Data Download" screen. Not part
 * of the SRS/ERD/HLD; reverse engineered from that reference app. A read
 * projection over this service's own `referrals`/`referral_followups`/
 * `Referral_trigger_sources` tables — the split this download wants already
 * exists structurally via `Referral.referralFollowups`/`referralTriggerSources`,
 * so no new models were needed — plus one cross-service call to
 * beneficiary-service to enforce ownership (see assertBeneficiaryInScope).
 */
export class BeneficiaryRiskReferralService {
  constructor(
    private readonly repository: BeneficiaryRiskReferralRepository,
    private readonly beneficiaryClient: BeneficiaryClient = new BeneficiaryClient(),
  ) {}

  /**
   * A SAKHI caller may only read her own beneficiary's referrals; a
   * SUPERVISOR only a beneficiary whose assigned Sakhi is on their own
   * roster. MANAGER/ADMIN are unscoped. Same IDOR guard
   * `beneficiaryRisk.service.ts`'s `getRiskProfile` applies, duplicated here
   * per the forklift rule (no cross-feature imports within a service).
   */
  private async assertBeneficiaryInScope(
    beneficiaryId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<void> {
    const isUnscoped = caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
    if (isUnscoped) return;

    const beneficiary = await this.beneficiaryClient.getById(beneficiaryId, authorizationHeader);
    if (!beneficiary) throw notFound('Beneficiary not found.');

    if (caller.roles.includes('SUPERVISOR')) {
      if (!caller.projectId) throw forbidden('Supervisor caller has no project scope.');
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (!roster.includes(beneficiary.sakhiId)) {
        throw forbidden("This beneficiary is outside this Supervisor's roster.");
      }
    } else if (beneficiary.sakhiId !== caller.id) {
      throw forbidden('You do not have access to this beneficiary.');
    }
  }

  /**
   * "Header" list for the beneficiary — deliberately excludes followups/
   * trigger sources (that's what makes `getReferralDetails` a separate
   * call).
   */
  async listReferrals(
    beneficiaryId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    await this.assertBeneficiaryInScope(beneficiaryId, caller, authorizationHeader);
    return this.repository.findHeadersByBeneficiary(beneficiaryId);
  }

  /**
   * A single referral's followups + trigger sources. 404s when the referral
   * doesn't exist, or exists but belongs to a different beneficiaryId than
   * the one in the path — the repository query already scopes on both ids
   * together, so both cases surface identically here.
   */
  async getReferralDetails(
    beneficiaryId: string,
    referralId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    await this.assertBeneficiaryInScope(beneficiaryId, caller, authorizationHeader);

    const referral = await this.repository.findDetailsById(beneficiaryId, referralId);
    if (!referral) throw notFound('Referral not found.');

    return {
      referralId: referral.id,
      followups: referral.referralFollowups,
      triggerSources: referral.referralTriggerSources,
    };
  }
}
