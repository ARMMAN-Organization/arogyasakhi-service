import { badGateway, HttpError } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

export interface ApprovalRequestRecord {
  id: string;
}

export interface CreateApprovalRequestInput {
  requestType: string;
  beneficiaryId?: string;
  sourceEntityType: string;
  sourceEntityId: string;
  reopenRequestId?: string;
  closureId?: string;
  requestedByUserId: string;
  decisionStatusLookupId: string;
}

/**
 * Raises a Quick Response card by calling approval-service's POST /approvals
 * through the gateway, forwarding the caller's own Authorization header —
 * same pattern this service's AuditClient/NotificationClient use.
 */
export class ApprovalClient {
  async create(input: CreateApprovalRequestInput, authorizationHeader: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/approvals`, {
        method: 'POST',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw badGateway('Unable to raise the approval request — approval-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to raise the approval request.');
      }
      throw badGateway(
        'Unable to raise the approval request — approval-service returned an error.',
      );
    }
  }

  /**
   * Resolves the approval_requests row raised for a closure, via
   * approval-service's GET /approvals/by-source?closureId=. Needed to link a
   * Closure Review decision notification's linkedEntityId to the id
   * GET /quick-response/:cardId actually expects — closures carries no
   * approval_requests id of its own (no cross-service relation).
   */
  async findByClosureId(
    closureId: string,
    authorizationHeader: string,
  ): Promise<ApprovalRequestRecord | null> {
    return this.findBySource(`closureId=${closureId}`, authorizationHeader);
  }

  /** Same as findByClosureId, for a reopen request. */
  async findByReopenRequestId(
    reopenRequestId: string,
    authorizationHeader: string,
  ): Promise<ApprovalRequestRecord | null> {
    return this.findBySource(`reopenRequestId=${reopenRequestId}`, authorizationHeader);
  }

  private async findBySource(
    query: string,
    authorizationHeader: string,
  ): Promise<ApprovalRequestRecord | null> {
    let res: Response;
    try {
      res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/approvals/by-source?${query}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the approval request — approval-service is unreachable.');
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the approval request.');
      }
      throw badGateway(
        'Unable to resolve the approval request — approval-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: ApprovalRequestRecord };
    return body.data;
  }
}
