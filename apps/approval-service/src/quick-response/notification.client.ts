import { badGateway } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import { DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

/**
 * Notifies a Sakhi after a Quick Response card decision, calling
 * notification-escalation-service's POST /notifications through the
 * gateway, forwarding the caller's own Authorization header — same pattern
 * closure-reopen-service's NotificationClient uses.
 */
export class NotificationClient {
  async notify(
    recipientUserId: string,
    notificationType: string,
    title: string,
    body: string,
    authorizationHeader: string,
    linkedEntity?: { linkedEntityType: string; linkedEntityId: string },
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/notifications`, {
        method: 'POST',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUserId,
          notificationType,
          title,
          body,
          status: 'UNREAD',
          ...linkedEntity,
        }),
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw badGateway(
        'Unable to notify the Sakhi — notification-escalation-service is unreachable.',
      );
    }

    if (!res.ok) {
      throw badGateway(
        'Unable to notify the Sakhi — notification-escalation-service returned an error.',
      );
    }
  }
}
