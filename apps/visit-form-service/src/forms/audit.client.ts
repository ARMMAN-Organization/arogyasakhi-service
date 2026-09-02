import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — matches this service's other clients (e.g.
// closure.client.ts/socio-demographics.client.ts/riskAssessment.client.ts).
const API_GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/** Ceiling for the audit-log write's downstream HTTP hop. */
const DOWNSTREAM_FETCH_TIMEOUT_MS = 8_000;

/**
 * Writes an audit_log entry after a Sakhi's form-answer edit, calling
 * audit-service's POST /audit through the gateway, forwarding the caller's
 * own Authorization header — same pattern approval-service's
 * quick-response/audit.client.ts (Task 4) uses, kept as its own copy per
 * this codebase's per-service client convention (no cross-service imports).
 *
 * Unlike Task 4's AuditClient, this one also accepts `beforeJson` — the
 * prior values of the edited fields — since FORM_ANSWER_EDIT is the first
 * caller in this codebase to populate it (SRS Appendix J.4: "Every edit
 * must be written to the audit log (field, old value, new value...)").
 */
export class AuditClient {
  async log(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    beforeJson: Record<string, unknown>,
    afterJson: Record<string, unknown>,
    authorizationHeader: string,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/audit`, {
        method: 'POST',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorUserId, action, entityType, entityId, beforeJson, afterJson }),
        signal: AbortSignal.timeout(DOWNSTREAM_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw badGateway('Unable to write the audit log entry — audit-service is unreachable.');
    }

    if (!res.ok) {
      throw badGateway('Unable to write the audit log entry — audit-service returned an error.');
    }
  }
}
