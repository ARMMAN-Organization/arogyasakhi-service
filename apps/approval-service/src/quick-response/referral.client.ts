import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface ReferralRecord {
  id: string;
  beneficiaryId: string;
  status: string;
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
}
