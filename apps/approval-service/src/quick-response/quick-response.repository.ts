import type { PrismaService } from '../prisma/prisma.service';

/** Data access for the approval_requests half of Quick Response's merged feed. */
export class QuickResponseRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated by `(createdAt, id)` DESC, same scheme as
   * notification-escalation-service's escalation.repository.ts — `id`
   * breaks ties within the same millisecond.
   *
   * `sakhiIds` scopes results to only requests raised by one of these
   * Sakhis — `null` for a privileged (MANAGER/ADMIN) caller, an array (the
   * caller's own assigned Sakhis, possibly empty) for a SUPERVISOR caller.
   * approval_requests has no supervisorId/projectId column of its own, so
   * this is resolved by the caller (see QuickResponseService.list) via
   * auth-service instead of being scoped here directly.
   */
  findMany(
    decisionStatusLookupId: string,
    limit: number,
    cursor: { createdAt: Date; id: string } | null,
    sakhiIds: string[] | null,
  ) {
    return this.prisma.approvalRequest.findMany({
      where: {
        decisionStatusLookupId,
        isDeleted: false,
        ...(sakhiIds ? { requestedByUserId: { in: sakhiIds } } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  findById(id: string) {
    return this.prisma.approvalRequest.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Batch counterpart of findById, for QuickResponseService.getCardDetails —
   * one query for a whole batch of candidate card ids instead of one
   * findById per card. No pagination needed: the caller bounds `ids` to
   * MAX_BATCH_CARD_IDS entries before calling this. An id not found (or
   * soft-deleted) is simply absent from the result, not an error — matches
   * the batch "by-ids" contract used across every other service in this
   * fix.
   */
  findManyByIds(ids: string[]) {
    return this.prisma.approvalRequest.findMany({ where: { id: { in: ids }, isDeleted: false } });
  }

  /**
   * Marks an approval_requests card decided — conditional on `decidedAt`
   * still being null, so a race between two concurrent decisions on the
   * same card only ever wins once. Returns false (not an error) when the
   * conditional update matches nothing, so the caller can turn that into a
   * 409 the same way every other decide() flow in this codebase does.
   *
   * Every APPROVAL_REQUEST_CARD_TYPES card type needs this — without it, a
   * card's real side effect (LMP write, referral/closure/reopen status
   * change) can be re-triggered by re-approving the same card, since
   * nothing on the approval_requests row itself ever recorded that it was
   * already decided.
   */
  async markDecided(
    id: string,
    decisionStatusLookupId: string,
    decidedByUserId: string,
    decisionNotes: string | undefined,
    decisionReasonCodeLookupId: string | undefined,
  ): Promise<boolean> {
    const result = await this.prisma.approvalRequest.updateMany({
      where: { id, isDeleted: false, decidedAt: null },
      data: {
        decisionStatusLookupId,
        decidedByUserId,
        decidedAt: new Date(),
        decisionNotes: decisionNotes ?? null,
        decisionReasonCodeLookupId: decisionReasonCodeLookupId ?? null,
      },
    });
    return result.count > 0;
  }
}
