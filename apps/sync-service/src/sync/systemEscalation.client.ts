import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) — mirrors sakhi.client.ts in this
// same directory.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface EscalationEvent {
  id: string;
  sakhiUserId: string | null;
  escalationType: string;
  status: string;
}

/**
 * Raises a SYNC_DELAY escalation via `POST /escalation-events` (through the
 * gateway), authenticating as this service's machine identity. Called at
 * Supervisor dashboard read time (getLastSyncedAtByRoster), not from a cron
 * job — per the build plan, sync delay is a passive list the Supervisor
 * sees, not a pushed notification, so no POST /notifications call exists
 * alongside this one. Server idempotently no-ops (returns the existing row)
 * on a duplicate OPEN escalation for the same sakhiUserId.
 */
export async function createSyncDelayEscalationEvent(
  sakhiUserId: string,
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
      body: JSON.stringify({ sakhiUserId, escalationType: 'SYNC_DELAY' }),
    });
  } catch {
    throw badGateway(
      'Unable to raise the sync-delay escalation — notification-escalation-service is unreachable.',
    );
  }

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new HttpError(res.status, body?.message ?? 'Unable to raise the escalation.');
    }
    throw badGateway(
      'Unable to raise the sync-delay escalation — notification-escalation-service returned an error.',
    );
  }

  const body = (await res.json()) as { data: EscalationEvent };
  return body.data;
}
