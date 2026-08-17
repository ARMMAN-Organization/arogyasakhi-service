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

  /**
   * Resolves the bare in-scope beneficiary ids for the caller's own
   * Sakhi/roster scope, via beneficiary-service's GET /beneficiaries/ids
   * (forwards the caller's own token — beneficiary-service applies its own
   * SAKHI/roster/MANAGER-ADMIN scoping, same as GET /beneficiaries/:id
   * above). Used by ReferralService.getSummary to filter referrals by
   * beneficiaryId, since referrals carries no sakhiId column.
   */
  async getIds(authorizationHeader: string): Promise<string[]> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/ids`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve beneficiary ids — beneficiary-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve beneficiary ids.');
      }
      throw badGateway(
        'Unable to resolve beneficiary ids — beneficiary-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: string[] };
    return body.data;
  }
}
