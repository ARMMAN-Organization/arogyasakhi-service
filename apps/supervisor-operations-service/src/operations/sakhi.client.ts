import { badGateway } from '@armman/service-commons';
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
      throw badGateway('Unable to resolve the Sakhi — the auth service returned an error.');
    }

    const body = (await res.json()) as { data: Sakhi };
    return body.data;
  }
}
