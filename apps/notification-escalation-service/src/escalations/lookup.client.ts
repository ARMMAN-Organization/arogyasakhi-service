import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) — see beneficiary.client.ts for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface LookupValue {
  id: string;
  valueCode: string;
}

interface LookupCategory {
  categoryCode: string;
  values: LookupValue[];
}

/**
 * Resolves a CLOSURE_PENDING_REASON lookup_value_id (client-supplied on
 * POST /escalations/:id/closure-pending-reason) to its own valueCode, via
 * auth-service's existing GET /lookups/CLOSURE_PENDING_REASON — used so
 * EscalationService.submitClosurePendingReason can tell whether `notes` is
 * required (OTHER) from the server's own read of the reason, never from
 * client input. Same shape as closure-reopen-service's own
 * LookupClient.resolveClosureReasonCode.
 */
export class LookupClient {
  async resolveClosurePendingReasonCode(
    lookupValueId: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/CLOSURE_PENDING_REASON`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve CLOSURE_PENDING_REASON — auth-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? 'Unable to resolve CLOSURE_PENDING_REASON.',
        );
      }
      throw badGateway(
        'Unable to resolve CLOSURE_PENDING_REASON — auth-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: LookupCategory };
    return body.data.values.find((v) => v.id === lookupValueId)?.valueCode ?? null;
  }
}
