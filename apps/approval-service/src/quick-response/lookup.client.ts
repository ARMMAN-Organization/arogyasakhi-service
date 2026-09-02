import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

interface LookupValue {
  id: string;
  valueCode: string;
}

interface LookupCategory {
  categoryCode: string;
  values: LookupValue[];
}

const APPROVAL_STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolves an APPROVAL_STATUS value code (e.g. "PENDING") to its
 * lookup_value_id for the current environment, since
 * approval_requests.decision_status_lookup_id is an environment-specific FK,
 * not a stable literal (unlike rules-service's hardcoded rule-version seed).
 *
 * The APPROVAL_STATUS category is near-static reference data (its 5 values
 * essentially never change at runtime), but every call to list()/decide()
 * was fetching it fresh over HTTP and sitting on the critical path before
 * the DB query could even start. It's cached in-process for
 * APPROVAL_STATUS_CACHE_TTL_MS with single-flight dedupe, so concurrent
 * requests during a cache miss share one fetch instead of stampeding
 * auth-service.
 */
export class LookupClient {
  private cached: { category: LookupCategory; expiresAt: number } | null = null;
  private inflight: Promise<LookupCategory | null> | null = null;

  private async fetchCategory(authorizationHeader: string): Promise<LookupCategory | null> {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.category;
    }
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      let res: Response;
      try {
        res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/lookups/APPROVAL_STATUS`, {
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
      this.cached = { category: body.data, expiresAt: Date.now() + APPROVAL_STATUS_CACHE_TTL_MS };
      return body.data;
    })();

    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  async resolveApprovalStatusId(
    valueCode: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    const category = await this.fetchCategory(authorizationHeader);
    return category?.values.find((v) => v.valueCode === valueCode)?.id ?? null;
  }

  /**
   * The reverse of resolveApprovalStatusId — resolves a
   * decision_status_lookup_id back to its APPROVAL_STATUS value code (e.g.
   * "PENDING"), for read endpoints that expose a human-readable status
   * rather than the raw FK. Fails open to null (not thrown) on any
   * resolution failure, matching this class's existing fail-open contract.
   */
  async resolveApprovalStatusCode(
    lookupValueId: string,
    authorizationHeader: string,
  ): Promise<string | null> {
    let category: LookupCategory | null;
    try {
      category = await this.fetchCategory(authorizationHeader);
    } catch {
      return null;
    }
    return category?.values.find((v) => v.id === lookupValueId)?.valueCode ?? null;
  }
}
