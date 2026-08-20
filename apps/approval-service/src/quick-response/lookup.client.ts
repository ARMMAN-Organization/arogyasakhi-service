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

/**
 * Resolves an APPROVAL_STATUS value code (e.g. "PENDING") to its
 * lookup_value_id for the current environment, since
 * approval_requests.decision_status_lookup_id is an environment-specific FK,
 * not a stable literal (unlike rules-service's hardcoded rule-version seed).
 */
export class LookupClient {
  async resolveApprovalStatusId(
    valueCode: string,
    authorizationHeader: string,
  ): Promise<string | null> {
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
    return body.data.values.find((v) => v.valueCode === valueCode)?.id ?? null;
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
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/lookups/APPROVAL_STATUS`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    const body = (await res.json()) as { data: LookupCategory };
    return body.data.values.find((v) => v.id === lookupValueId)?.valueCode ?? null;
  }
}
