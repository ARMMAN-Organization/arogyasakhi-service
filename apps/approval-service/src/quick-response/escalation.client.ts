import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

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
        { headers: { Authorization: authorizationHeader } },
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
}
