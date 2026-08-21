import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface SakhiRecord {
  sakhiId: string;
  displayName: string;
  mobileNumber: string;
}

/**
 * Resolves a Sakhi's display name and contact number by calling
 * auth-service's GET /sakhis/:sakhiId through the gateway, forwarding the
 * caller's own Authorization header — used by Quick Response's card-
 * enrichment endpoint for every card type's "Sakhi name" and "contact
 * option" fields. A Sakhi's own user id doubles as her sakhiId throughout
 * this system (same identity space DATA_RESTORE's requestedByUserId relies
 * on), so this also resolves DATA_RESTORE's "Sakhi name/id".
 */
export class SakhiClient {
  async getById(sakhiId: string, authorizationHeader: string): Promise<SakhiRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/sakhis/${sakhiId}`, {
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
