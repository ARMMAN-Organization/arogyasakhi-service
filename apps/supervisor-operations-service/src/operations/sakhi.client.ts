import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

interface Sakhi {
  sakhiId: string;
  supervisorId: string | null;
  primaryProjectId: string;
}

/**
 * Fetches a Sakhi's own record from auth-service (through the gateway, so the
 * caller's forwarded Authorization header is verified) — used to check which
 * Supervisor a Sakhi is actually assigned to before returning or writing her
 * inventory-transaction history. supervisor-operations-service doesn't own
 * sakhi_profiles (forklift rule: no cross-service DB joins), so this
 * ownership check can only happen over the API.
 */
export class SakhiClient {
  async findById(sakhiId: string, authorizationHeader: string): Promise<Sakhi | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.AUTH_SERVICE_BASE_URL}/api/v1/sakhis/${sakhiId}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the Sakhi — the auth service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      // 4xx here reflects auth-service's own decision about this request
      // (e.g. its own project-scope check on GET /sakhis/:id) — a real
      // rejection, not this service's infra failing, so it must reach the
      // caller as-is rather than masquerade as a 502. Only a genuine
      // 5xx from auth-service is actually "the upstream is broken".
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the Sakhi.');
      }
      throw badGateway('Unable to resolve the Sakhi — the auth service returned an error.');
    }

    const body = (await res.json()) as { data: Sakhi };
    return body.data;
  }
}
