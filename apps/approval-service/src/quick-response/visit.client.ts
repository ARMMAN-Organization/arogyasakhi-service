import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface VisitInstanceRecord {
  id: string;
  scheduleId: string;
  actualVisitDate: string | null;
  statusLookupValueId: string | null;
}

/**
 * Resolves a visit instance's own fields by calling visit-form-service's
 * GET /visits/:id through the gateway, forwarding the caller's own
 * Authorization header — used by Quick Response's REFERRAL_INCOMPLETE card
 * enrichment for its "visit reference" field. Returns the visit's own
 * scheduleId/actualVisitDate/status as-is — resolving the schedule's own
 * visitCode/type into a display label would need a further
 * GET /visit-schedules/:id chase, out of scope for this pass.
 */
export class VisitClient {
  async getById(id: string, authorizationHeader: string): Promise<VisitInstanceRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/visits/${id}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the visit — visit-form-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the visit.');
      }
      throw badGateway('Unable to resolve the visit — visit-form-service returned an error.');
    }

    const body = (await res.json()) as { data: VisitInstanceRecord };
    return body.data;
  }
}
