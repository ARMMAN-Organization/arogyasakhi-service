import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — that schema requires DATABASE_URL/PUBLIC_BASE_URLS
// with no defaults, which fails module load (process.exit) in any test that
// never otherwise loads config, e.g. this service's own jest workers in CI.
// Matches beneficiary-service's geography.client.ts/sakhi.client.ts convention.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface BeneficiaryCaseRecord {
  id: string;
  sakhiId: string;
}

/**
 * Resolves a beneficiary's own record by calling beneficiary-service's
 * GET /beneficiaries/:id through the gateway, forwarding the caller's own
 * Authorization header — same pattern `referrals/beneficiary.client.ts` uses
 * (duplicated here, not imported, per the forklift rule: no cross-feature
 * imports within a service either, only shared framework code). Used to
 * resolve a beneficiary's assigned Sakhi so a SAKHI/SUPERVISOR caller can be
 * scoped to their own beneficiary/roster before reading her risk profile.
 */
export class BeneficiaryClient {
  async getById(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}`, {
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
