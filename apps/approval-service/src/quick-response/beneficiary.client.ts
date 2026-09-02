import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import { DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

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
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
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

  /**
   * Batch-resolves beneficiaryName for a page of Quick Response cards via
   * beneficiary-service's GET /beneficiaries/by-ids-with-risk — one call per
   * page instead of one per row. Ids outside the caller's scope, or simply
   * not found, are silently absent from the result (server-side behavior,
   * not a 404/403), so callers should treat a missing id as "name
   * unavailable" rather than an error.
   */
  async getManyWithRisk(
    beneficiaryIds: string[],
    authorizationHeader: string,
  ): Promise<Map<string, string>> {
    if (beneficiaryIds.length === 0) return new Map();

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/beneficiaries/by-ids-with-risk?ids=${beneficiaryIds.join(',')}`,
        {
          headers: { Authorization: authorizationHeader },
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway('Unable to resolve beneficiaries — beneficiary-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve beneficiaries.');
      }
      throw badGateway('Unable to resolve beneficiaries — beneficiary-service returned an error.');
    }

    const body = (await res.json()) as { data: Array<{ id: string; beneficiaryName: string }> };
    return new Map(body.data.map((row) => [row.id, row.beneficiaryName]));
  }

  /**
   * Batch-resolves full case detail (pii, motherCaseDetails,
   * riskConditionSummaries) for a page of Quick Response cards' detail view,
   * via beneficiary-service's GET /beneficiaries/by-ids-detail — one call
   * per batch instead of one GET /beneficiaries/:id per card (the N×4
   * concurrent-fan-out bug fixed by QuickResponseService.getCardDetails).
   * Ids outside the caller's scope, or simply not found, are silently
   * absent from the result (server-side behavior, not a 404/403) — same
   * contract as getManyWithRisk.
   */
  async getManyDetailByIds(
    beneficiaryIds: string[],
    authorizationHeader: string,
  ): Promise<Map<string, BeneficiaryCaseDetail>> {
    if (beneficiaryIds.length === 0) return new Map();

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/beneficiaries/by-ids-detail?ids=${beneficiaryIds.join(',')}`,
        {
          headers: { Authorization: authorizationHeader },
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway('Unable to resolve beneficiaries — beneficiary-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve beneficiaries.');
      }
      throw badGateway('Unable to resolve beneficiaries — beneficiary-service returned an error.');
    }

    const body = (await res.json()) as { data: BeneficiaryCaseDetail[] };
    return new Map(body.data.map((row) => [row.id, row]));
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
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
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
