import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors sakhis/sakhi.client.ts.
const GATEWAY_BASE_URL =
  process.env.NOTIFICATION_ESCALATION_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface ActiveTransferWindow {
  active: boolean;
  reviewDeadlineAt: string | null;
}

/**
 * A beneficiary's active Missed Visit Escalation TRANSFER review window
 * (FR-SV-4.3), via notification-escalation-service's own GET
 * /escalations/beneficiaries/:beneficiaryId/active-transfer-window. Used by
 * VisitInstanceService.updateStatus's SUPERVISOR-only notMetReason gate —
 * fails open (treated as "no active window") on any error, since this check
 * must not block a visit write over a transient cross-service failure; the
 * caller logs the failure.
 */
export async function getActiveTransferWindow(
  beneficiaryId: string,
  authorizationHeader: string,
): Promise<ActiveTransferWindow> {
  const url = `${GATEWAY_BASE_URL}/api/v1/escalations/beneficiaries/${beneficiaryId}/active-transfer-window`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: authorizationHeader } });
  } catch {
    throw badGateway(
      'Unable to resolve the transfer window — notification-escalation-service is unreachable.',
    );
  }

  if (!res.ok) {
    throw badGateway(
      'Unable to resolve the transfer window — notification-escalation-service returned an error.',
    );
  }

  const body = (await res.json()) as { data: ActiveTransferWindow };
  return body.data;
}
