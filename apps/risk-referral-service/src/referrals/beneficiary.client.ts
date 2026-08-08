import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface BeneficiaryCaseRecord {
  id: string;
  sakhiId: string;
}

/**
 * Resolves a beneficiary's own record by calling beneficiary-service's
 * GET /beneficiaries/:id through the gateway, forwarding the caller's own
 * Authorization header — same pattern this service's sibling clients in
 * approval-service/closure-reopen-service use. Used to resolve the assigned
 * Sakhi's id for a referral (referrals carries no sakhiId column) so
 * ReferralService.decide can scope a SUPERVISOR caller to their own roster,
 * the same IDOR guard beneficiary-service's own single-case mutations apply.
 */
export class BeneficiaryClient {
  async getById(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord | null> {
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

    const body = (await res.json()) as { data: BeneficiaryCaseRecord };
    return body.data;
  }
}
