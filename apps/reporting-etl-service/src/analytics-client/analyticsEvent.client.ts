import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — same convention as risk-referral-service's
// beneficiary.client.ts / beneficiary-service's geography.client.ts.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface AnalyticsEventRecord {
  id: string;
  sakhiUserId: string | null;
  eventName: string;
  occurredAt: string;
  payloadJson: unknown;
}

/**
 * Fetches one page of raw analytics events for a feature area/window, via
 * audit-service's SYSTEM-only GET /analytics/events (through the gateway,
 * per this codebase's convention — the gateway verifies the service token).
 */
export class AnalyticsEventClient {
  async listPage(
    featureArea: string,
    since: Date,
    until: Date,
    cursor: string | undefined,
    authorizationHeader: string,
  ): Promise<{ items: AnalyticsEventRecord[]; nextCursor: string | null }> {
    const url = new URL(`${API_GATEWAY_BASE_URL}/api/v1/analytics/events`);
    url.searchParams.set('featureArea', featureArea);
    url.searchParams.set('since', since.toISOString());
    url.searchParams.set('until', until.toISOString());
    if (cursor) url.searchParams.set('cursor', cursor);

    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: authorizationHeader } });
    } catch {
      throw badGateway('Unable to fetch analytics events — audit-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to fetch analytics events.');
      }
      throw badGateway('Unable to fetch analytics events — audit-service returned an error.');
    }

    const body = (await res.json()) as {
      data: { items: AnalyticsEventRecord[]; nextCursor: string | null };
    };
    return body.data;
  }

  /** Fetches every page for a feature area/window, following nextCursor until exhausted. */
  async listAll(
    featureArea: string,
    since: Date,
    until: Date,
    authorizationHeader: string,
  ): Promise<AnalyticsEventRecord[]> {
    const all: AnalyticsEventRecord[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listPage(featureArea, since, until, cursor, authorizationHeader);
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }
}
