import type { PrismaService } from '../prisma/prisma.service';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';
import type { CreateEscalationEventInput } from './dto/create-escalation-event.dto';

/** Data access for escalation events. Owns only this service's `escalation_event` table. */
export class EscalationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated by `(createdAt, id)` DESC — `id` breaks ties within the
   * same millisecond so the cursor stays gapless. Fetches `limit + 1` rows to
   * know whether a next page exists without a separate count query.
   */
  async findMany(query: ListEscalationEventsInput, cursor: { createdAt: Date; id: string } | null) {
    const rows = await this.prisma.escalationEvent.findMany({
      where: {
        status: query.status,
        isDeleted: false,
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
      take: query.limit + 1,
    });
    return rows;
  }

  findById(id: string) {
    return this.prisma.escalationEvent.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Raises a new escalation event, always OPEN — status is never a create
   * input (see createEscalationEventSchema's doc comment).
   */
  create(input: CreateEscalationEventInput, createdByUserId: string) {
    return this.prisma.escalationEvent.create({
      data: {
        beneficiaryId: input.beneficiaryId,
        escalationType: input.escalationType,
        visitId: input.visitId ?? null,
        referralId: input.referralId ?? null,
        visitsMissedCount: input.visitsMissedCount ?? null,
        assignedSupervisorId: input.assignedSupervisorId ?? null,
        status: 'OPEN',
        createdByUserId,
      },
    });
  }

  /**
   * Only updates a row that is still at `fromStatus` — `updateMany`'s
   * affected count (rather than a separate read-then-write) is the
   * concurrency guard: if another decision already landed between the
   * caller's findById and this call, the count comes back 0 and the service
   * turns that into a 409 instead of silently overwriting an
   * already-decided escalation. Same pattern as every other service's own
   * decide()/updateStatus().
   *
   * `resolvedAt` is left null for TRANSFER_REQUESTED — unlike
   * ACKNOWLEDGED/RESOLVED, it is not a terminal outcome; the card stays
   * pending through the Manager's up-to-15-day review window
   * (`reviewDeadlineAt`), not "resolved" the moment TRANSFER is decided.
   */
  async updateStatus(
    id: string,
    fromStatus: 'OPEN',
    toStatus: 'ACKNOWLEDGED' | 'RESOLVED' | 'TRANSFER_REQUESTED',
    actionTaken: string | null,
    reviewDeadlineAt: Date | null = null,
  ): Promise<boolean> {
    const result = await this.prisma.escalationEvent.updateMany({
      where: { id, isDeleted: false, status: fromStatus },
      data: {
        status: toStatus,
        actionTaken,
        resolvedAt: toStatus === 'TRANSFER_REQUESTED' ? null : new Date(),
        ...(toStatus === 'TRANSFER_REQUESTED' ? { reviewDeadlineAt } : {}),
      },
    });
    return result.count > 0;
  }

  /**
   * The most recent TRANSFER_REQUESTED row for a beneficiary, if any — used
   * by GET /escalations/beneficiaries/:beneficiaryId/active-transfer-window
   * (visit-form-service's own SUPERVISOR-only notMetReason gate during the
   * Manager review window). Not further filtered by escalationType: only
   * decideMissedVisit's TRANSFER branch ever sets this status, so any match
   * is already a missed-visit escalation.
   */
  findActiveTransferWindow(beneficiaryId: string) {
    return this.prisma.escalationEvent.findFirst({
      where: { beneficiaryId, status: 'TRANSFER_REQUESTED', isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: { reviewDeadlineAt: true },
    });
  }
}
