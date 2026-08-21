import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — that schema requires DATABASE_URL/PUBLIC_BASE_URLS
// with no defaults, which fails module load (process.exit) in any test that
// never otherwise loads config, e.g. this service's own jest workers in CI.
// Matches beneficiary-risk/beneficiary.client.ts's own convention.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

/**
 * Resolves the bare in-scope beneficiary ids for a given Sakhi, via
 * beneficiary-service's `GET /beneficiaries/ids?sakhiId=...` (forwards the
 * caller's own token — beneficiary-service applies its own SAKHI/roster/
 * MANAGER-ADMIN scoping). Duplicated from referrals/beneficiary.client.ts
 * per the forklift rule, trimmed to just this one method — `getRiskBySakhi`
 * never needs a single beneficiary record, only the id set.
 */
export class BeneficiaryClient {
  async getIds(authorizationHeader: string, sakhiId: string): Promise<string[]> {
    const url = new URL(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/ids`);
    url.searchParams.set('sakhiId', sakhiId);

    let res: Response;
    try {
      res = await fetch(url, {
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
