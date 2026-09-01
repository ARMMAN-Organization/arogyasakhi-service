import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import { DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

export interface ClosureRecord {
  id: string;
  beneficiaryId: string;
  supervisorStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
}

export interface ClosureDetailRecord extends ClosureRecord {
  closureType: string;
  closureReasonLookupValueId: string;
  closureDate: string;
  supervisorNotes: string | null;
}

/**
 * Decides a CLOSURE_REVIEW card by calling closure-reopen-service's
 * PATCH /closures/:id/decision through the gateway, forwarding the caller's
 * own Authorization header — same pattern this service's ReopenRequestClient
 * uses. The Sakhi notification for this decision is sent by
 * closure-reopen-service's own decide flow, not here — see that service's
 * ClosureService.decide.
 */
export class ClosureClient {
  async decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    supervisorNotes: string | undefined,
    authorizationHeader: string,
  ): Promise<ClosureRecord> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/closures/${id}/decision`, {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, supervisorNotes }),
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw badGateway('Unable to decide the closure — closure-reopen-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to decide the closure.');
      }
      throw badGateway('Unable to decide the closure — closure-reopen-service returned an error.');
    }

    const body = (await res.json()) as { data: ClosureRecord };
    return body.data;
  }

  /**
   * Real-time supervisorStatus for a batch of closure ids, via
   * closure-reopen-service's GET /closures/decision-status — lets
   * QuickResponseService.list() detect a closure decided directly
   * (bypassing approval-service), instead of trusting approval_requests'
   * own cached decision state. Returns an empty map without a network call
   * for an empty `ids` — there is nothing to reconcile.
   */
  async getDecisionStatusByIds(
    ids: string[],
    authorizationHeader: string,
  ): Promise<Map<string, ClosureRecord['supervisorStatus']>> {
    if (ids.length === 0) return new Map();

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/closures/decision-status?ids=${ids.join(',')}`,
        {
          headers: { Authorization: authorizationHeader },
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway(
        'Unable to fetch closure decision status — closure-reopen-service is unreachable.',
      );
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? 'Unable to fetch closure decision status.',
        );
      }
      throw badGateway(
        'Unable to fetch closure decision status — closure-reopen-service returned an error.',
      );
    }

    const body = (await res.json()) as {
      data: Array<{ id: string; supervisorStatus: ClosureRecord['supervisorStatus'] }>;
    };
    return new Map(body.data.map((row) => [row.id, row.supervisorStatus]));
  }

  /**
   * A closure's full detail, via closure-reopen-service's GET /closures/:id
   * — used by Quick Response's card-enrichment endpoint for CLOSURE_REVIEW
   * cards.
   */
  async getById(id: string, authorizationHeader: string): Promise<ClosureDetailRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/closures/${id}`, {
        headers: { Authorization: authorizationHeader },
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw badGateway('Unable to fetch the closure — closure-reopen-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to fetch the closure.');
      }
      throw badGateway('Unable to fetch the closure — closure-reopen-service returned an error.');
    }

    const body = (await res.json()) as { data: ClosureDetailRecord };
    return body.data;
  }
}
