import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface BeneficiaryCaseRecord {
  id: string;
  currentStatus: string;
}

/**
 * Reactivates a CLOSED beneficiary case by calling beneficiary-service's
 * PATCH /beneficiaries/:id/reactivate through the gateway, forwarding the
 * caller's own Authorization header — same pattern this service's
 * AuditClient/NotificationClient use. Used after an approved reopen request
 * (FR-SV-4.7/FR-S-10.3) so "Beneficiary is added to Sakhi's Open beneficiary
 * list" actually happens, not just the reopen_requests row flipping.
 */
export class BeneficiaryClient {
  async reactivateCase(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord> {
    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/reactivate`,
        {
          method: 'PATCH',
          headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        },
      );
    } catch {
      throw badGateway(
        'Unable to reactivate the beneficiary — beneficiary-service is unreachable.',
      );
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to reactivate the beneficiary.');
      }
      throw badGateway(
        'Unable to reactivate the beneficiary — beneficiary-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: BeneficiaryCaseRecord };
    return body.data;
  }
}
