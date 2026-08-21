import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface BeneficiaryCaseRecord {
  id: string;
}

export interface RiskConditionSummary {
  riskConditionId: string;
  phase: string;
  latestGrade: string | null;
  latestAssessedAt: string | null;
  everHighestGrade: string | null;
  everAtRiskFlag: boolean;
  currentReferralTriggerFlag: boolean;
  currentHrVisitTriggerFlag: boolean;
}

export interface BeneficiaryCaseDetail {
  id: string;
  sakhiId: string;
  pii: { fullName: string; padaId: string | null };
  motherCaseDetails: { lmpDate: string; eddDate: string } | null;
  riskConditionSummaries: RiskConditionSummary[];
}

/**
 * Applies an approved LMP change by calling beneficiary-service's
 * PATCH /beneficiaries/:id/lmp through the gateway, forwarding the caller's
 * own Authorization header — same pattern this service's ReopenRequestClient
 * uses.
 */
export class BeneficiaryClient {
  /**
   * Fetches a beneficiary's own record — used to resolve the assigned
   * Sakhi's id for an ACCOMPANIED_REFERRAL incentive trigger (FR-SV-4.9),
   * since neither approval_requests nor referrals carries a sakhiId column.
   */
  async getById(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseDetail | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the beneficiary — beneficiary-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the beneficiary.');
      }
      throw badGateway(
        'Unable to resolve the beneficiary — beneficiary-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: BeneficiaryCaseDetail };
    return body.data;
  }

  async applyLmpChange(
    beneficiaryId: string,
    lmpDate: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord> {
    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/lmp`,
        {
          method: 'PATCH',
          headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ lmpDate }),
        },
      );
    } catch {
      throw badGateway('Unable to apply the LMP change — beneficiary-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to apply the LMP change.');
      }
      throw badGateway('Unable to apply the LMP change — beneficiary-service returned an error.');
    }

    const body = (await res.json()) as { data: BeneficiaryCaseRecord };
    return body.data;
  }
}
