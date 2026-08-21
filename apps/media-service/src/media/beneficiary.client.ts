import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema (requires DATABASE_URL etc. with no defaults),
// which process.exit(1)s at module-load time in any test that never
// otherwise loads config — matches every other service's HTTP-only client
// convention (e.g. visit-form-service's create-child.client.ts).
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface BeneficiaryCaseRecord {
  id: string;
  sakhiId: string;
}

/**
 * Resolves a beneficiary's own record by calling beneficiary-service's
 * GET /beneficiaries/:id through the gateway, forwarding the caller's own
 * Authorization header. Used by MediaAssetService.getById to delegate
 * ownership scoping to beneficiary-service's own SAKHI-own-case /
 * SUPERVISOR-roster / MANAGER-ADMIN-unrestricted check when a media asset
 * carries a `beneficiaryId` — media-service has no sakhiId data of its own
 * to check a caller's access against, and duplicating that IDOR logic here
 * would drift from beneficiary-service's as it evolves. Only whether the
 * call succeeds or throws matters here, not the returned shape.
 */
export class BeneficiaryClient {
  async getById(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the beneficiary — beneficiary-service is unreachable.');
    }

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
