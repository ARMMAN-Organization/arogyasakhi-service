import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema (requires DATABASE_URL etc. with no defaults),
// which process.exit(1)s at module-load time in any test that never
// otherwise loads config — matches every other HTTP-only client's
// convention in this repo (e.g. beneficiary.client.ts).
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
 * Resolves an APPROVAL_STATUS value code (e.g. "PENDING") to its
 * lookup_value_id for the current environment, since
 * approval_requests.decision_status_lookup_id is an environment-specific FK,
 * not a stable literal — same client as approval-service's Quick Response
 * LookupClient, duplicated here since closure-reopen-service can't import
 * across service boundaries (forklift rule).
 */
export class LookupClient {
  async resolveApprovalStatusId(
    valueCode: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/APPROVAL_STATUS`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve APPROVAL_STATUS — auth-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve APPROVAL_STATUS.');
      }
      throw badGateway('Unable to resolve APPROVAL_STATUS — auth-service returned an error.');
    }

    const body = (await res.json()) as { data: LookupCategory };
    return body.data.values.find((v) => v.valueCode === valueCode)?.id ?? null;
  }

  /**
   * Resolves a CLOSURE_REASON lookup_value_id (client-supplied on
   * POST /closures) to its own valueCode — used so ClosureService.create()
   * can derive whether a closure needs supervisor review from the server's
   * own read of the reason, never from a client-supplied supervisorStatus
   * (see createClosureSchema — that field no longer exists on the DTO
   * specifically to close this trust gap).
   */
  async resolveClosureReasonCode(
    lookupValueId: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/CLOSURE_REASON`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve CLOSURE_REASON — auth-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve CLOSURE_REASON.');
      }
      throw badGateway('Unable to resolve CLOSURE_REASON — auth-service returned an error.');
    }

    const body = (await res.json()) as { data: LookupCategory };
    return body.data.values.find((v) => v.id === lookupValueId)?.valueCode ?? null;
  }
}
