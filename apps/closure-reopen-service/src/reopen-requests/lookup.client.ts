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
}
