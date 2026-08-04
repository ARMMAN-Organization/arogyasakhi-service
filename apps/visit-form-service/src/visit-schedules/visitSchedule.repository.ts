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

  /** Every existing row among the given localScheduleUuids, for the idempotency/conflict checks. */
  findByLocalScheduleUuids(localScheduleUuids: string[]) {
    return this.prisma.visitSchedule.findMany({
      where: { localScheduleUuid: { in: localScheduleUuids }, isDeleted: false },
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
