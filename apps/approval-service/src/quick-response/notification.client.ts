import { badGateway } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Notifies a Sakhi after a Quick Response decision, calling
 * notification-escalation-service's POST /notifications directly (not
 * through the gateway), forwarding the caller's own Authorization header —
 * same pattern supervisor-operations-service's SakhiClient uses.
 */
export class NotificationClient {
  async notify(
    recipientUserId: string,
    notificationType: string,
    title: string,
    body: string,
    authorizationHeader: string,
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
        }),
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
