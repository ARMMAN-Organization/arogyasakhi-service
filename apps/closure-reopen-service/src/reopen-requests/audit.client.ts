import { badGateway } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Writes an audit_log entry after a reopen request decision, calling
 * audit-service's POST /audit through the gateway, forwarding the caller's
 * own Authorization header — same pattern approval-service's Quick Response
 * clients use.
 */
export class AuditClient {
  async log(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterJson: Record<string, unknown>,
    authorizationHeader: string,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/audit`, {
        method: 'POST',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorUserId, action, entityType, entityId, afterJson }),
      });
    } catch {
      throw badGateway('Unable to write the audit log entry — audit-service is unreachable.');
    }

    if (!res.ok) {
      throw badGateway('Unable to write the audit log entry — audit-service returned an error.');
    }
  }
}
