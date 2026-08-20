import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface GeographyUnitRecord {
  geographyUnitId: string;
  name: string;
  geoType: string;
}

/**
 * Resolves a geography unit's name (used for a Pada) by calling
 * auth-service's GET /geography-units/:id through the gateway, forwarding
 * the caller's own Authorization header — used by Quick Response's card-
 * enrichment endpoint to turn a beneficiary's pii.padaId into a display
 * name. There is no dedicated /padas read endpoint — Pada rows live in
 * geography_units with geoType: 'PADA' (see beneficiary-service's own
 * padaId column doc comment).
 */
export class GeographyClient {
  async getById(id: string, authorizationHeader: string): Promise<GeographyUnitRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/geography-units/${id}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the geography unit — auth-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the geography unit.');
      }
      throw badGateway('Unable to resolve the geography unit — auth-service returned an error.');
    }

    const body = (await res.json()) as { data: GeographyUnitRecord };
    return body.data;
  }
}
