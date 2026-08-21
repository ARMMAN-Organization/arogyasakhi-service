import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import type { VisitSummaryBySakhiQueryInput } from './dto/visit-summary-by-sakhi-query.dto';

interface VisitSummary {
  total: number;
  byStatus: Record<string, number>;
  endingSoonVisitsCount: number;
}

/**
 * Proxies visit-form-service's `GET /visits/visit-summary` (through the
 * gateway, so the caller's forwarded Authorization header is verified and
 * visit-form-service's own SUPERVISOR-roster check applies) for the
 * `/visits/by-sakhi/:sakhiId/summary` call-sheet route — this service does no
 * roster-membership check of its own, since visit-form-service already
 * rejects a sakhiId outside the caller's roster with its own 403.
 */
export class VisitSummaryClient {
  async getBySakhi(
    sakhiId: string,
    query: VisitSummaryBySakhiQueryInput,
    authorizationHeader: string,
  ): Promise<VisitSummary> {
    const params = new URLSearchParams({ sakhiId });
    if (query.fromDate) params.set('fromDate', query.fromDate);
    if (query.toDate) params.set('toDate', query.toDate);

    let res: Response;
    try {
      res = await fetch(
        `${appConfig.AUTH_SERVICE_BASE_URL}/api/v1/visits/visit-summary?${params}`,
        {
          headers: { Authorization: authorizationHeader },
        },
      );
    } catch {
      throw badGateway('Unable to fetch the visit summary — the visit service is unreachable.');
    }

    if (!res.ok) {
      // A 4xx here is visit-form-service's own decision about this request
      // (e.g. sakhiId not in the caller's roster) — a real rejection, not
      // this service's infra failing, so it must reach the caller as-is.
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to fetch the visit summary.');
      }
      throw badGateway('Unable to fetch the visit summary — the visit service returned an error.');
    }

    const body = (await res.json()) as { data: VisitSummary };
    return body.data;
  }
}
