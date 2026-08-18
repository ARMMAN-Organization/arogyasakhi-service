import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema in tests that never otherwise load config —
// matches risk-referral-service's beneficiary.client.ts/sakhi.client.ts
// convention.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface ApiSakhi {
  sakhiId: string;
  supervisorId: string | null;
}

/**
 * Resolves a single Sakhi's own record via auth-service's
 * `GET /sakhis/:sakhiId`, called through the gateway forwarding the
 * caller's own Authorization header. Used to check whether a `userId` a
 * SUPERVISOR passes to `GET /sync/pending` is actually a Sakhi on their own
 * roster — sync-service owns no sakhi_profiles row of its own (forklift
 * rule: no cross-service DB joins).
 */
export class SakhiClient {
  async findById(sakhiId: string, authorizationHeader: string): Promise<ApiSakhi | null> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/sakhis/${sakhiId}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the Sakhi — the auth service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the Sakhi.');
      }
      throw badGateway('Unable to resolve the Sakhi — the auth service returned an error.');
    }

    const body = (await res.json()) as { data: ApiSakhi };
    return body.data;
  }
}
