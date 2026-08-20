import { badGateway, HttpError } from '@armman/service-commons';

// Same convention as beneficiary.client.ts — read directly (not via
// appConfig) so importing this client doesn't pull in app-config's full
// schema at module-load time.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface TransferNoticeResult {
  sent: boolean;
  managerEmail: string;
  usedFallback: boolean;
}

/**
 * Sends the Missed Visit Escalation TRANSFER email (FR-SV-4.3) by calling
 * auth-service's POST /supervisors/manager-transfer-notice through the
 * gateway, forwarding the caller's own Authorization header. Auth-service
 * resolves the Sakhi's own displayName and her designated Manager itself
 * (it owns that identity data) — this client only passes what
 * notification-escalation-service already holds.
 */
export class ManagerNoticeClient {
  async send(
    input: {
      sakhiId: string;
      beneficiaryName: string;
      visitsMissedCount: number | null;
      visitType: string;
    },
    authorizationHeader: string,
  ): Promise<TransferNoticeResult> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/supervisors/manager-transfer-notice`, {
        method: 'POST',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw badGateway('Unable to send the Manager transfer notice — auth-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(
          res.status,
          body?.message ?? 'Unable to send the Manager transfer notice.',
        );
      }
      throw badGateway(
        'Unable to send the Manager transfer notice — auth-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: TransferNoticeResult };
    return body.data;
  }
}
