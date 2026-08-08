import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface ClosureRecord {
  id: string;
  beneficiaryId: string;
  supervisorStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
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
}
