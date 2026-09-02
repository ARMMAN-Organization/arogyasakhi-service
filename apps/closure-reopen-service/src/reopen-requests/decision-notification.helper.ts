import type { SakhiClient } from './sakhi.client';
import type { ApprovalClient } from './approval.client';

/**
 * Best-effort — a name lookup failure falls back to no name (generic
 * notification text) rather than blocking the decision it's attached to.
 * Shared by ClosureService and ReopenRequestService (both take the same
 * SakhiClient dependency) so the fallback behavior/log format can't drift
 * between the two copies.
 */
export async function resolveSakhiName(
  sakhiClient: SakhiClient,
  sakhiId: string,
  authorizationHeader: string,
): Promise<string | null> {
  try {
    const sakhi = await sakhiClient.getById(sakhiId, authorizationHeader);
    return sakhi?.displayName ?? null;
  } catch (err) {
    console.error(`Failed to resolve Sakhi ${sakhiId}'s name for a notification:`, err);
    return null;
  }
}

/**
 * Best-effort — the Quick Response card id (approval_requests.id) for a
 * closure or reopen request, used to link the decision notification so
 * GET /quick-response/:cardId can resolve it. A failure here (no matching
 * approval request, or approval-service unreachable) must not block the
 * decision — the notification is simply sent without a linkedEntity rather
 * than with a closures/reopen_requests-table id GET /quick-response/:cardId
 * doesn't recognise. Shared by ClosureService and ReopenRequestService,
 * parameterized by which ApprovalClient lookup to use.
 */
export async function resolveQuickResponseCardId(
  approvalClient: ApprovalClient,
  kind: 'closure' | 'reopen request',
  sourceId: string,
  authorizationHeader: string,
): Promise<string | null> {
  try {
    const approvalRequest =
      kind === 'closure'
        ? await approvalClient.findByClosureId(sourceId, authorizationHeader)
        : await approvalClient.findByReopenRequestId(sourceId, authorizationHeader);
    return approvalRequest?.id ?? null;
  } catch (err) {
    console.error(`Failed to resolve the Quick Response card id for ${kind} ${sourceId}:`, err);
    return null;
  }
}
