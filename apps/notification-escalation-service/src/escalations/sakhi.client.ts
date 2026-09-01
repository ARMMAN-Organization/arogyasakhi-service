import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema at module-load time — matches this module's own
// beneficiary.client.ts / manager-notice.client.ts / lookup.client.ts convention.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface SakhiRecord {
  sakhiId: string;
  displayName: string;
  mobileNumber: string;
  supervisorId: string | null;
}

/**
 * Resolves a Sakhi's own record from auth-service (through the gateway) —
 * used to enrich an escalation event card with the Sakhi's name/contact for
 * the Supervisor app's decision view (SRS FR-SV-4.3). A trimmed, single-
 * purpose duplicate of notifications/sakhi.client.ts per this codebase's
 * per-module client convention (see beneficiary.client.ts's own doc comment).
 */
export class SakhiClient {
  async findById(sakhiId: string, authorizationHeader: string): Promise<SakhiRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/sakhis/${sakhiId}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the Sakhi — the auth service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the Sakhi.');
      }
      throw badGateway('Unable to resolve the Sakhi — the auth service returned an error.');
    }

    const body = (await res.json()) as { data: SakhiRecord };
    return body.data;
  }
}
