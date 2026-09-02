import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import { DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

export interface SakhiRecord {
  sakhiId: string;
  displayName: string;
  mobileNumber: string;
  supervisorId: string | null;
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
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
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

  /**
   * Batch-resolves sakhiName for a page of Quick Response cards via
   * auth-service's GET /sakhis/by-ids — one call per page instead of one
   * per unique Sakhi (see resolveSakhiNamesById, the caller). Ids outside
   * the caller's scope, or simply not found, are silently absent from the
   * result (server-side behavior, not a 404/403), same as
   * BeneficiaryClient.getManyWithRisk.
   */
  async getManyByIds(
    sakhiIds: string[],
    authorizationHeader: string,
  ): Promise<Map<string, string>> {
    if (sakhiIds.length === 0) return new Map();

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/sakhis/by-ids?ids=${sakhiIds.join(',')}`,
        {
          headers: { Authorization: authorizationHeader },
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway('Unable to resolve Sakhis — auth-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve Sakhis.');
      }
      throw badGateway('Unable to resolve Sakhis — auth-service returned an error.');
    }

    const body = (await res.json()) as { data: SakhiRecord[] };
    return new Map(body.data.map((sakhi) => [sakhi.sakhiId, sakhi.displayName]));
  }

  /**
   * Batch-resolves full Sakhi records (displayName + mobileNumber) for a
   * page of Quick Response cards' detail view, via the same
   * GET /sakhis/by-ids endpoint getManyByIds already calls — but keeping the
   * full record instead of collapsing to just displayName, since card
   * detail also needs sakhiContactNumber (see resolveCommonFields/
   * buildCommonFields). Used by QuickResponseService.getCardDetails. Does
   * not change getManyByIds's own signature/behavior — list() depends on it.
   */
  async getManyRecordsByIds(
    sakhiIds: string[],
    authorizationHeader: string,
  ): Promise<Map<string, SakhiRecord>> {
    if (sakhiIds.length === 0) return new Map();

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/sakhis/by-ids?ids=${sakhiIds.join(',')}`,
        {
          headers: { Authorization: authorizationHeader },
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway('Unable to resolve Sakhis — auth-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve Sakhis.');
      }
      throw badGateway('Unable to resolve Sakhis — auth-service returned an error.');
    }

    const body = (await res.json()) as { data: SakhiRecord[] };
    return new Map(body.data.map((sakhi) => [sakhi.sakhiId, sakhi]));
  }

  /**
   * Resolves the calling Supervisor's own assigned Sakhi ids, via
   * auth-service's GET /projects/:projectId/sakhis — used to scope Quick
   * Response's approval_requests half to only the caller's own Sakhis
   * (approval_requests carries no supervisorId/projectId column of its own).
   * That endpoint already restricts a non-privileged SUPERVISOR caller to
   * `supervisorId === caller.id` (see auth-service's SakhiService.listByProject),
   * since it's called with the caller's own forwarded Authorization header —
   * so the ids returned here are already the caller's own, no further
   * filtering needed on this side.
   */
  async getOwnSakhiIds(projectId: string, authorizationHeader: string): Promise<string[]> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/projects/${projectId}/sakhis`, {
        headers: { Authorization: authorizationHeader },
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw badGateway("Unable to resolve the caller's own Sakhis — auth-service is unreachable.");
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? "Unable to resolve the caller's own Sakhis.",
        );
      }
      throw badGateway(
        "Unable to resolve the caller's own Sakhis — auth-service returned an error.",
      );
    }

    const body = (await res.json()) as { data: SakhiRecord[] };
    return body.data.map((sakhi) => sakhi.sakhiId);
  }
}
