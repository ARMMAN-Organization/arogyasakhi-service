import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) — mirrors escalation.client.ts in this
// same directory (despite the name, the gateway's own base URL).
const GATEWAY_BASE_URL =
  process.env.NOTIFICATION_ESCALATION_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface EscalationEvent {
  id: string;
  beneficiaryId: string | null;
  escalationType: string;
  status: string;
}

/**
 * Raises an escalation event via `POST /escalation-events` (through the
 * gateway), authenticating as this service's machine identity — the
 * missed-visit job's SYSTEM-role counterpart of a human ADMIN call. Server
 * idempotently no-ops (returns the existing row) on a duplicate OPEN
 * escalation for the same natural key, so callers don't need their own
 * client-side dedup.
 */
export async function createEscalationEvent(
  input: {
    beneficiaryId: string;
    escalationType: string;
    visitId?: string;
    visitsMissedCount?: number;
    assignedSupervisorId?: string | null;
  },
  systemAccessToken: string,
): Promise<EscalationEvent> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}/api/v1/escalation-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${systemAccessToken}`,
      },
      body: JSON.stringify(input),
    });
  } catch {
    throw badGateway(
      'Unable to raise the escalation — notification-escalation-service is unreachable.',
    );
  }

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new HttpError(res.status, body?.message ?? 'Unable to raise the escalation.');
    }
    throw badGateway(
      'Unable to raise the escalation — notification-escalation-service returned an error.',
    );
  }

  const body = (await res.json()) as { data: EscalationEvent };
  return body.data;
}

/**
 * Notifies a Supervisor via `POST /notifications` (through the gateway),
 * authenticating as this service's machine identity. Best-effort by design
 * for the missed-visit job: the escalation event itself is the durable
 * record; a failed notification push is logged by the caller, not retried
 * or allowed to fail the whole job run.
 */
export async function createNotification(
  input: {
    recipientUserId: string;
    notificationType: string;
    title: string;
    body?: string;
    priority?: number;
    linkedEntityType?: string;
    linkedEntityId?: string;
  },
  systemAccessToken: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}/api/v1/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${systemAccessToken}`,
      },
      body: JSON.stringify({ ...input, status: 'UNREAD' }),
    });
  } catch {
    throw badGateway(
      'Unable to send the notification — notification-escalation-service is unreachable.',
    );
  }

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new HttpError(res.status, body?.message ?? 'Unable to send the notification.');
    }
    throw badGateway(
      'Unable to send the notification — notification-escalation-service returned an error.',
    );
  }
}
