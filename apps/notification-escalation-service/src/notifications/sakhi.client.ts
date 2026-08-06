import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

interface Sakhi {
  sakhiId: string;
  supervisorId: string | null;
}

/**
 * Fetches a Sakhi's own record from auth-service — used to verify a
 * SUPERVISOR caller of POST /notifications actually owns the Sakhi they're
 * notifying, closing an impersonation/IDOR gap on the role widening that
 * lets approval-service notify on a Supervisor's behalf. Mirrors
 * supervisor-operations-service's SakhiClient exactly.
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
