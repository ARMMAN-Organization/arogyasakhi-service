import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface ReopenRequestRecord {
  id: string;
  beneficiaryId: string;
  supervisorStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
}

/**
 * Decides a REOPEN card by calling closure-reopen-service's
 * PATCH /reopen-requests/:id/decision directly (not through the gateway),
 * forwarding the caller's own Authorization header — same pattern
 * supervisor-operations-service's SakhiClient uses.
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
}
