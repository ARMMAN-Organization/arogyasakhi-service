import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) — matches this service's other HTTP-only
// client convention (see beneficiary.client.ts's own doc comment).
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface SakhiRecord {
  sakhiId: string;
  displayName: string;
  mobileNumber: string;
}

/**
 * Resolves a Sakhi's display name by calling auth-service's
 * GET /sakhis/:sakhiId through the gateway, forwarding the caller's own
 * Authorization header — used to name the Sakhi in a closure/reopen decision
 * notification's title. A Sakhi's own user id doubles as her sakhiId
 * throughout this system (same identity space submittedByUserId/
 * requestedByUserId relies on elsewhere in this service), same convention
 * as approval-service's own sakhi.client.ts.
 */
export class SakhiClient {
  async getById(sakhiId: string, authorizationHeader: string): Promise<SakhiRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/sakhis/${sakhiId}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the Sakhi — auth-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the Sakhi.');
      }
      throw badGateway('Unable to resolve the Sakhi — auth-service returned an error.');
    }

    const body = (await res.json()) as { data: SakhiRecord };
    return body.data;
  }
}
