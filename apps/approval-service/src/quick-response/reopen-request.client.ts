import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface ReopenRequestRecord {
  id: string;
  beneficiaryId: string;
  supervisorStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ReopenRequestDetailRecord extends ReopenRequestRecord {
  requestReason: string;
  decisionNotes: string | null;
}

/**
 * Decides a REOPEN card by calling closure-reopen-service's
 * PATCH /reopen-requests/:id/decision through the gateway, forwarding the
 * caller's own Authorization header — same pattern supervisor-operations-
 * service's SakhiClient uses.
 */
export class ReopenRequestClient {
  async decide(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    decisionReasonCodeLookupId: string | undefined,
    decisionNotes: string | undefined,
    authorizationHeader: string,
  ): Promise<ReopenRequestRecord> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/reopen-requests/${id}/decision`, {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decisionReasonCodeLookupId, decisionNotes }),
      });
    } catch {
      throw badGateway(
        'Unable to decide the reopen request — closure-reopen-service is unreachable.',
      );
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to decide the reopen request.');
      }
      throw badGateway(
        'Unable to decide the reopen request — closure-reopen-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: ReopenRequestRecord };
    return body.data;
  }

  /**
   * Real-time supervisorStatus for a batch of reopen request ids, via
   * closure-reopen-service's GET /reopen-requests/decision-status — lets
   * QuickResponseService.list() detect a reopen request decided directly
   * (bypassing approval-service), instead of trusting approval_requests'
   * own cached decision state. Returns an empty map without a network call
   * for an empty `ids` — there is nothing to reconcile.
   */
  async getDecisionStatusByIds(
    ids: string[],
    authorizationHeader: string,
  ): Promise<Map<string, ReopenRequestRecord['supervisorStatus']>> {
    if (ids.length === 0) return new Map();

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/reopen-requests/decision-status?ids=${ids.join(',')}`,
        { headers: { Authorization: authorizationHeader } },
      );
    } catch {
      throw badGateway(
        'Unable to fetch reopen request decision status — closure-reopen-service is unreachable.',
      );
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? 'Unable to fetch reopen request decision status.',
        );
      }
      throw badGateway(
        'Unable to fetch reopen request decision status — closure-reopen-service returned an error.',
      );
    }

    const body = (await res.json()) as {
      data: Array<{ id: string; supervisorStatus: ReopenRequestRecord['supervisorStatus'] }>;
    };
    return new Map(body.data.map((row) => [row.id, row.supervisorStatus]));
  }

  /**
   * A reopen request's full detail, via closure-reopen-service's
   * GET /reopen-requests/:id — used by Quick Response's card-enrichment
   * endpoint for REOPEN cards.
   */
  async getById(
    id: string,
    authorizationHeader: string,
  ): Promise<ReopenRequestDetailRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/reopen-requests/${id}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway(
        'Unable to fetch the reopen request — closure-reopen-service is unreachable.',
      );
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to fetch the reopen request.');
      }
      throw badGateway(
        'Unable to fetch the reopen request — closure-reopen-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: ReopenRequestDetailRecord };
    return body.data;
  }
}
