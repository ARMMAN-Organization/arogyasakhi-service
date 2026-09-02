import type { PrismaService } from '../prisma/prisma.service';
import type {
  VisitCodeType,
  AnchorType,
} from '../../../../node_modules/.prisma/client-visit-form-service';

export interface NewScheduleRow {
  localScheduleUuid: string;
  visitCode: string;
  visitType: VisitCodeType;
  sequenceNo: number;
  scheduledDate: Date;
  windowStartDate: Date;
  windowEndDate: Date;
  anchorType: AnchorType;
  // Resolved against already-stored rows before this reaches the
  // repository. Null here means either "no anchor" or "anchor is a sibling
  // row in this same batch" — batchAnchorLocalUuid distinguishes the two.
  anchorVisitId: string | null;
  // Set only when anchorVisitLocalUuid pointed at another row in this same
  // batch — its real id isn't known until after that sibling is inserted,
  // so createAllOrNothing patches anchorVisitId in a second pass.
  batchAnchorLocalUuid: string | null;
}

/** Data access for visit schedules. Owns only this service's `visit_schedules` table. */
export class VisitScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every existing row among the given localScheduleUuids, for the
   * idempotency/conflict checks — scoped to `beneficiaryId` so a
   * localScheduleUuid collision with a row belonging to a *different*
   * beneficiary is never mistaken for "already existed": it's treated as
   * new instead, and the insert then hits the column's own @unique
   * constraint (surfaced as a 409, not silently accepted).
   */
  findByLocalScheduleUuids(beneficiaryId: string, localScheduleUuids: string[]) {
    return this.prisma.visitSchedule.findMany({
      where: { beneficiaryId, localScheduleUuid: { in: localScheduleUuids }, isDeleted: false },
    });
  }

  /**
   * Existing rows for this beneficiary sharing any of the given visitCodes —
   * used to detect a SCHEDULE_CONFLICT (same beneficiary+visitCode+rule
   * version, different localScheduleUuid) even when this batch's own
   * localScheduleUuids are all new (so the idempotency lookup above finds
   * nothing to compare against).
   */
  findByBeneficiaryAndVisitCodes(beneficiaryId: string, visitCodes: string[]) {
    return this.prisma.visitSchedule.findMany({
      where: { beneficiaryId, visitCode: { in: visitCodes }, isDeleted: false },
    });
  }

  findById(id: string) {
    return this.prisma.visitSchedule.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * OPEN schedules whose window has closed — the missed-visit job's
   * candidate set (missedVisit.job.ts). Bounded by `take` so one tick can't
   * try to process an unbounded backlog in a single run; a backlog larger
   * than that just gets picked up on the next tick.
   */
  findOverdueOpenSchedules(now: Date, take: number) {
    return this.prisma.visitSchedule.findMany({
      where: { status: 'OPEN', windowEndDate: { lt: now }, isDeleted: false },
      orderBy: { windowEndDate: 'asc' },
      take,
    });
  }

  /**
   * Flips one schedule OPEN->MISSED. The `where: { status: 'OPEN' }` guard
   * makes this idempotent under a concurrent run (or a retried job tick):
   * `updateMany`'s matched count is 0 if another run already transitioned
   * it, so the caller knows not to re-raise an escalation for it.
   */
  async markMissed(id: string): Promise<boolean> {
    const result = await this.prisma.visitSchedule.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'MISSED' },
    });
    return result.count > 0;
  }

  /**
   * Reverts a schedule this same job tick already flipped to MISSED back to
   * OPEN — used only when a downstream step after markMissed (VisitInstance
   * write, escalation lookup/evaluation) throws. Without this, that schedule
   * would never be selected by findOverdueOpenSchedules again and the
   * required escalation would be silently and permanently lost (see
   * missedVisit.job.ts's per-schedule try/catch). The `status: 'MISSED'`
   * guard mirrors markMissed's own idempotency guard: only undoes this
   * tick's own transition, never a MISSED row some other process already
   * relied on.
   */
  async revertToOpen(id: string): Promise<boolean> {
    const result = await this.prisma.visitSchedule.updateMany({
      where: { id, status: 'MISSED' },
      data: { status: 'OPEN' },
    });
    return result.count > 0;
  }

  /**
   * Already-due schedules for this beneficiary+visitType, most-recent first
   * — the missed-visit job walks this list counting the unbroken trailing
   * run of MISSED to derive `consecutiveMissedCount` (scoped to the exact
   * visitType, e.g. ANC vs ANC_HR are counted separately — see
   * missedVisit.job.ts for why). Bounded to a small window since only the
   * leading run matters, not the full history.
   *
   * `windowEndDate: { lte: asOf }` excludes schedules that aren't due yet —
   * ANC/PP/INC schedules are generated as a full batch up front
   * (scheduleMapper.ts), so a beneficiary typically has several future OPEN
   * rows sitting ahead of the visit that just missed. Without this filter,
   * those future rows sort first (scheduledDate desc) and
   * countConsecutiveMissed breaks on the first non-MISSED row it sees,
   * always returning 0 and silently defeating HR/consecutive-count
   * escalation. `asOf` is the caller's `now`, not this call's own time, so
   * a schedule reprocessed on retry sees the same "due" boundary as its
   * first attempt.
   */
  findRecentByBeneficiaryAndVisitType(beneficiaryId: string, visitType: VisitCodeType, asOf: Date) {
    return this.prisma.visitSchedule.findMany({
      where: { beneficiaryId, visitType, isDeleted: false, windowEndDate: { lte: asOf } },
      orderBy: { scheduledDate: 'desc' },
      take: 20,
    });
  }

  /**
   * Re-stamps a stored row's provenance after a rule-pack republish evaluates
   * an already-scheduled slot identically — the schedule content is unchanged
   * so no supersede is needed, but generatedByRuleVersionId must reflect the
   * version that most recently confirmed it, not the one that first created it.
   */
  updateGeneratedByRuleVersionId(id: string, generatedByRuleVersionId: string) {
    return this.prisma.visitSchedule.update({
      where: { id },
      data: { generatedByRuleVersionId },
    });
  }

  /**
   * Inserts every new row in one transaction — all-or-nothing, per FR-S-2.2's
   * "a partially-written schedule is worse than no schedule" requirement.
   *
   * Two passes inside the same transaction:
   * 1. Insert every row, with anchorVisitId set only where it was already
   *    resolvable against previously-stored rows (batchAnchorLocalUuid rows
   *    insert with anchorVisitId: null for now).
   * 2. For every row whose anchor was a same-batch sibling, UPDATE
   *    anchorVisitId to that sibling's just-assigned real id, now that pass
   *    1 has created it and we know it. This is why createMany can't be
   *    used here — it never returns per-row ids to resolve against.
   */
  async createAllOrNothing(
    rows: NewScheduleRow[],
    beneficiaryId: string,
    generatedByRuleVersionId: string,
    createdByUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const created = [];
      const idByLocalUuid = new Map<string, string>();

      for (const row of rows) {
        const insertedRow = await tx.visitSchedule.create({
          data: {
            localScheduleUuid: row.localScheduleUuid,
            beneficiaryId,
            visitCode: row.visitCode,
            visitType: row.visitType,
            sequenceNo: row.sequenceNo,
            scheduledDate: row.scheduledDate,
            windowStartDate: row.windowStartDate,
            windowEndDate: row.windowEndDate,
            anchorType: row.anchorType,
            anchorVisitId: row.anchorVisitId,
            generatedByRuleVersionId,
            createdByUserId,
            updatedByUserId: createdByUserId,
          },
        });
        idByLocalUuid.set(row.localScheduleUuid, insertedRow.id);
        created.push(insertedRow);
      }

      for (const row of rows) {
        if (!row.batchAnchorLocalUuid) continue;
        // resolveAnchors (visitSchedule.service.ts) already guarantees every
        // batchAnchorLocalUuid refers to another row in this same `rows`
        // array, so both lookups below always resolve.
        const anchorId = idByLocalUuid.get(row.batchAnchorLocalUuid);
        const rowId = idByLocalUuid.get(row.localScheduleUuid);
        if (!anchorId || !rowId) continue;
        await tx.visitSchedule.update({
          where: { id: rowId },
          data: { anchorVisitId: anchorId },
        });
      }

      // The response only ever reports localScheduleUuid/id/status (see
      // CreatedScheduleResult), none of which the batch-anchor patch above
      // changes, so the pass-1 `created` rows are already correct to return.
      return created;
    });
  }
}
