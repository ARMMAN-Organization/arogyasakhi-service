import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) — mirrors this directory's other clients.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface EscalationEvent {
  id: string;
  beneficiaryId: string | null;
  escalationType: string;
  status: string;
  // Distinguishes "a new row was just inserted" from "an existing OPEN row
  // for the same natural key was reused" — status alone is 'OPEN' either
  // way, so a caller that only wants to notify the first time an escalation
  // is actually raised (not on every re-processing of an already-open one)
  // needs this flag.
  wasCreated: boolean;
}

/**
 * Raises an escalation event via `POST /escalation-events` (through the
 * gateway), authenticating as this service's machine identity — the
 * overdue-follow-up job's SYSTEM-role counterpart of a human ADMIN call.
 * Server idempotently no-ops (returns the existing row) on a duplicate OPEN
 * escalation for the same natural key.
 */
export async function createEscalationEvent(
  input: {
    beneficiaryId: string;
    escalationType: string;
    referralId?: string;
    assignedSupervisorId: string;
  },
  systemAccessToken: string,
): Promise<EscalationEvent> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/escalation-events`, {
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
 * authenticating as this service's machine identity. Best-effort: a failed
 * notification push is logged by the caller, not retried, and never fails
 * the job run — the escalation event is the durable record.
 */
export async function createNotification(
  input: {
    recipientUserId: string;
    notificationType: string;
    title: string;
    linkedEntityType?: string;
    linkedEntityId?: string;
  },
  systemAccessToken: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/notifications`, {
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
