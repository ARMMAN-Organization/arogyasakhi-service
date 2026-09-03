import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import { DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

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
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
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

  /**
   * Restores every visit/form record previously soft-deleted for one Sakhi,
   * by calling visit-form-service's PATCH /visits/restore through the
   * gateway — used by the DATA_RESTORE card's approved-decision path
   * (decideDataRestoreCard) alongside UserClient.reactivateUser and
   * BeneficiaryClient.restoreForSakhi. Not tolerated by this client itself
   * — the caller decides how a failure here should be surfaced (see
   * decideDataRestoreCard's own doc comment on partial-failure handling).
   */
  async restoreForSakhi(
    sakhiUserId: string,
    authorizationHeader: string,
  ): Promise<{ restoredVisitCount: number }> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/visits/restore`, {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sakhiUserId }),
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw badGateway(
        "Unable to restore the Sakhi's visit data — visit-form-service is unreachable.",
      );
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? "Unable to restore the Sakhi's visit data.",
        );
      }
      throw badGateway(
        "Unable to restore the Sakhi's visit data — visit-form-service returned an error.",
      );
    }

    const body = (await res.json()) as { data: { restoredVisitCount: number } };
    return body.data;
  }
}
