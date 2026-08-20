import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface ReferralRecord {
  id: string;
  beneficiaryId: string;
  status: string;
}

export interface ReferralDetailRecord extends ReferralRecord {
  visitId: string | null;
  referralDate: string;
  facilityType: string | null;
  facilityName: string | null;
  photoEvidenceMediaAssetId: string | null;
  incompleteCount: number;
  latestFollowup: {
    followupDate: string;
    notVisitedReason: string | null;
    outcome: string | null;
  } | null;
}

/**
 * Decides a REFERRAL_INCOMPLETE or ACCOMPANIED_REFERRAL card by calling
 * risk-referral-service's PATCH /referrals/:id/decision through the gateway,
 * forwarding the caller's own Authorization header — same pattern this
 * service's ReopenRequestClient/ClosureClient use.
 */
export class ReferralClient {
  async decide(
    id: string,
    decision: 'LAPSE' | 'REFILL' | 'COMPLETE',
    authorizationHeader: string,
  ): Promise<ReferralRecord> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/referrals/${id}/decision`, {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
    } catch {
      throw badGateway('Unable to decide the referral — risk-referral-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to decide the referral.');
      }
      throw badGateway('Unable to decide the referral — risk-referral-service returned an error.');
    }

    const body = (await res.json()) as { data: ReferralRecord };
    return body.data;
  }

  /**
   * Real-time status for a batch of referral ids, via
   * risk-referral-service's GET /referrals/decision-status — lets
   * QuickResponseService.list() detect a referral decided directly
   * (bypassing approval-service), instead of trusting approval_requests'
   * own cached decision state. Returns an empty map without a network call
   * for an empty `ids` — there is nothing to reconcile.
   */
  async getDecisionStatusByIds(
    ids: string[],
    authorizationHeader: string,
  ): Promise<Map<string, ReferralRecord['status']>> {
    if (ids.length === 0) return new Map();

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/referrals/decision-status?ids=${ids.join(',')}`,
        { headers: { Authorization: authorizationHeader } },
      );
    } catch {
      throw badGateway(
        'Unable to fetch referral decision status — risk-referral-service is unreachable.',
      );
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? 'Unable to fetch referral decision status.',
        );
      }
      throw badGateway(
        'Unable to fetch referral decision status — risk-referral-service returned an error.',
      );
    }

    const body = (await res.json()) as {
      data: Array<{ id: string; status: ReferralRecord['status'] }>;
    };
    return new Map(body.data.map((row) => [row.id, row.status]));
  }

  /**
   * A referral's full detail plus follow-up summary, via risk-referral-
   * service's GET /referrals/:id — used by Quick Response's card-enrichment
   * endpoint for both ACCOMPANIED_REFERRAL and REFERRAL_INCOMPLETE cards.
   */
  async getById(id: string, authorizationHeader: string): Promise<ReferralDetailRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/referrals/${id}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to fetch the referral — risk-referral-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to fetch the referral.');
      }
      throw badGateway('Unable to fetch the referral — risk-referral-service returned an error.');
    }

    const body = (await res.json()) as { data: ReferralDetailRecord };
    return body.data;
  }
}
