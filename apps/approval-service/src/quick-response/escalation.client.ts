import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import { DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

export interface EscalationCard {
  cardId: string;
  cardType: 'MISSED_VISIT' | 'EDD_NEARING';
  cardSource: 'escalation_events';
  beneficiaryId: string;
  visitId: string | null;
  referralId: string | null;
  escalationType: string;
  status: string;
  raisedAt: string;
}

export interface EscalationEventRecord {
  id: string;
  status: string;
  actionTaken: string | null;
}

interface EscalationEventsResponse {
  cards: EscalationCard[];
  nextCursor: string | null;
}

/**
 * Fetches escalation-sourced Quick Response cards from
 * notification-escalation-service — called through the gateway, forwarding
 * the caller's own Authorization header, same pattern supervisor-operations-
 * service's SakhiClient uses.
 */
export class EscalationClient {
  async list(
    status: string,
    cursor: string | undefined,
    limit: number,
    authorizationHeader: string,
  ): Promise<EscalationEventsResponse> {
    const params = new URLSearchParams({ status, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/escalation-events?${params.toString()}`,
        {
          headers: { Authorization: authorizationHeader },
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway('Unable to fetch escalation events — the service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to fetch escalation events.');
      }
      throw badGateway('Unable to fetch escalation events — the service returned an error.');
    }

    const body = (await res.json()) as { data: EscalationEventsResponse };
    return body.data;
  }

  /** Fetches a single escalation-sourced card, or null if it doesn't exist. */
  async findById(id: string, authorizationHeader: string): Promise<EscalationCard | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/escalation-events/${id}`, {
        headers: { Authorization: authorizationHeader },
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw badGateway('Unable to fetch the escalation event — the service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to fetch the escalation event.');
      }
      throw badGateway('Unable to fetch the escalation event — the service returned an error.');
    }

    const body = (await res.json()) as { data: EscalationCard };
    return body.data;
  }

  /**
   * Acknowledges an EDD Nearing card via notification-escalation-service's
   * dedicated POST /edd-nearing-requests/:id/acknowledge, through the
   * gateway. Called by QuickResponseService.decide() so an EDD_NEARING
   * acknowledge actually persists (OPEN -> ACKNOWLEDGED) instead of
   * returning a fake success with nothing written.
   */
  async acknowledgeEddNearing(
    id: string,
    authorizationHeader: string,
  ): Promise<EscalationEventRecord> {
    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/edd-nearing-requests/${id}/acknowledge`,
        {
          method: 'POST',
          headers: { Authorization: authorizationHeader },
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway('Unable to acknowledge the EDD Nearing card — the service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? 'Unable to acknowledge the EDD Nearing card.',
        );
      }
      throw badGateway(
        'Unable to acknowledge the EDD Nearing card — the service returned an error.',
      );
    }

    const body = (await res.json()) as { data: EscalationEventRecord };
    return body.data;
  }

  /**
   * Decides a Missed Visit Escalation card via notification-escalation-
   * service's dedicated POST /missed-visit-escalations/:id/decision,
   * through the gateway. Called by QuickResponseService.decide() so a
   * CLOSE/TRANSFER decision actually persists instead of returning a fake
   * success with nothing written.
   */
  async decideMissedVisit(
    id: string,
    action: 'TRANSFER' | 'CLOSE',
    authorizationHeader: string,
  ): Promise<EscalationEventRecord> {
    let res: Response;
    try {
      res = await fetch(
        `${appConfig.API_GATEWAY_BASE_URL}/api/v1/missed-visit-escalations/${id}/decision`,
        {
          method: 'POST',
          headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
          signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
        },
      );
    } catch {
      throw badGateway(
        'Unable to decide the Missed Visit Escalation card — the service is unreachable.',
      );
    }

    if (!res.ok) {
      // 4xx/501 are passed through deliberately, not masked as a generic
      // 502 — they're the downstream service's own business-rule signals
      // (e.g. wrong status for a transition), not an infra fault.
      if ((res.status >= 400 && res.status < 500) || res.status === 501) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? 'Unable to decide the Missed Visit Escalation card.',
        );
      }
      throw badGateway(
        'Unable to decide the Missed Visit Escalation card — the service returned an error.',
      );
    }

    const body = (await res.json()) as { data: EscalationEventRecord };
    return body.data;
  }
}
