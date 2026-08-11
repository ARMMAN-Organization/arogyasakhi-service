import type { PrismaService } from '../prisma/prisma.service';
import type {
  VisitCodeType,
  AnchorType,
} from '../../../../node_modules/.prisma/client-visit-form-service';
import type { ListVisitSchedulesQuery } from './dto/list-visit-schedules.dto';

interface ListCursor {
  updatedAt: string;
  id: string;
}

/** Encodes a row's sort key as an opaque pagination cursor. */
function encodeCursor(row: { updatedAt: Date; id: string }): string {
  const cursor: ListCursor = { updatedAt: row.updatedAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Decodes a cursor produced by encodeCursor; returns null on any malformed input. */
function decodeCursor(cursor: string): ListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.updatedAt === 'string' && typeof parsed?.id === 'string') {
      return parsed as ListCursor;
    }
    return null;
  } catch {
    return null;
  }
}

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
   * Keyset-paginated list/sync-pull for one beneficiary's schedule — same
   * cursor pattern as beneficiary-service's GET /beneficiaries (sort key
   * (updatedAt desc, id desc), base64url cursor, limit+1 fetch to detect
   * hasMore without a separate COUNT query).
   */
  async findMany(query: ListVisitSchedulesQuery) {
    const where: NonNullable<Parameters<typeof this.prisma.visitSchedule.findMany>[0]>['where'] = {
      beneficiaryId: query.beneficiaryId,
      isDeleted: false,
    };
    if (query.status) where.status = query.status;
    if (query.updatedAfter) where.updatedAt = { gt: new Date(query.updatedAfter) };

    const decodedCursor = query.cursor ? decodeCursor(query.cursor) : null;

    const rows = await this.prisma.visitSchedule.findMany({
      where: decodedCursor
        ? {
            ...where,
            OR: [
              { updatedAt: { lt: new Date(decodedCursor.updatedAt) } },
              { updatedAt: new Date(decodedCursor.updatedAt), id: { lt: decodedCursor.id } },
            ],
          }
        : where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const lastItem = items[items.length - 1];
    return { items, nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null };
  }

  /**
   * Bulk-transitions every OPEN/GENERATED schedule for a beneficiary to
   * LAPSED (FR-S-3.7, FR-S-10.1/10.2) — idempotent: a beneficiary with no
   * open schedules simply updates zero rows, not an error.
   */
  lapseOpen(beneficiaryId: string, updatedByUserId: string) {
    return this.prisma.visitSchedule.updateMany({
      where: { beneficiaryId, status: { in: ['OPEN', 'GENERATED'] }, isDeleted: false },
      data: { status: 'LAPSED', updatedByUserId },
    });
  }

  /**
   * Bulk-transitions every OPEN/GENERATED ANC-family schedule for a
   * beneficiary to SUPERSEDED — the ANC visit-count formula depends on EDD,
   * so an approved LMP/EDD change (FR-SV-4.2) invalidates the beneficiary's
   * existing ANC schedule, not just future visits. PP/NN/INC/CCV rows are
   * untouched — those formulas don't depend on LMP/EDD. Idempotent: a
   * beneficiary with no open ANC schedules simply updates zero rows.
   */
  supersedeAnc(beneficiaryId: string, updatedByUserId: string) {
    return this.prisma.visitSchedule.updateMany({
      where: {
        beneficiaryId,
        visitType: { in: ['ANC', 'ANC_HR', 'ANC_POST_EDD'] },
        status: { in: ['OPEN', 'GENERATED'] },
        isDeleted: false,
      },
      data: { status: 'SUPERSEDED', updatedByUserId },
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
