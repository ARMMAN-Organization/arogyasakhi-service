import type { PrismaService } from '../prisma/prisma.service';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';
import type { UpdateVisitInstanceInput } from './dto/update-visitInstance.dto';

/** Data access for visit instances. Owns only this service's `visit_instances` table. */
export class VisitInstanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.visitInstance.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  findByLocalVisitUuid(localVisitUuid: string) {
    return this.prisma.visitInstance.findUnique({ where: { localVisitUuid } });
  }

  findById(id: string) {
    return this.prisma.visitInstance.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Counts in-scope visits by their raw statusLookupValueId, filtered by
   * VisitSchedule.scheduledDate — the date the visit was DUE, not
   * actualVisitDate (when/if it happened), per the visit-summary widget's
   * confirmed semantics: a MISSED visit has no actualVisitDate but must
   * still be countable within the period it was due in. The service layer
   * resolves each statusLookupValueId to its human-readable valueCode.
   */
  async countByStatus(filters: {
    sakhiId?: string;
    sakhiIds?: string[];
    fromDate?: string;
    toDate?: string;
  }) {
    const where: NonNullable<Parameters<typeof this.prisma.visitInstance.groupBy>[0]>['where'] = {
      isDeleted: false,
    };
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };
    if (filters.fromDate || filters.toDate) {
      where.schedule = {
        scheduledDate: {
          ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00.000Z`) } : {}),
          ...(filters.toDate ? { lte: new Date(`${filters.toDate}T23:59:59.999Z`) } : {}),
        },
      };
    }

    return this.prisma.visitInstance.groupBy({
      by: ['statusLookupValueId'],
      where,
      _count: { _all: true },
    });
  }

  /**
   * Counts in-scope PENDING/MISSED visits (identified by
   * `dueOrOverdueStatusLookupValueIds`, resolved by the service layer since
   * this repository has no access to the VISIT_STATUS lookup category)
   * whose VisitSchedule.windowEndDate falls within `[today, endBoundary]` —
   * the "ending soon" sub-count. Filtered by scheduledDate the same as
   * countByStatus for consistent role/date-range scoping; windowEndDate is
   * the actual comparison field per the "ending soon" semantics.
   */
  async countEndingSoon(filters: {
    sakhiId?: string;
    sakhiIds?: string[];
    fromDate?: string;
    toDate?: string;
    dueOrOverdueStatusLookupValueIds: string[];
    today: Date;
    endBoundary: Date;
  }) {
    if (filters.dueOrOverdueStatusLookupValueIds.length === 0) return 0;

    const where: NonNullable<Parameters<typeof this.prisma.visitInstance.count>[0]>['where'] = {
      isDeleted: false,
      statusLookupValueId: { in: filters.dueOrOverdueStatusLookupValueIds },
      schedule: {
        windowEndDate: { gte: filters.today, lte: filters.endBoundary },
        ...(filters.fromDate || filters.toDate
          ? {
              scheduledDate: {
                ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00.000Z`) } : {}),
                ...(filters.toDate ? { lte: new Date(`${filters.toDate}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
    };
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };

    return this.prisma.visitInstance.count({ where });
  }

  /**
   * Counts in-scope visits per beneficiaryId, grouped also by
   * statusLookupValueId — for the pada-breakdown widget, which needs
   * due/overdue counts per beneficiary (then summed per pada by the
   * caller). Filtered by VisitSchedule.scheduledDate same as countByStatus.
   * An empty `beneficiaryIds` returns no rows (not an error) — the caller
   * (api-gateway) may pass an empty list for a pada with zero beneficiaries.
   */
  async countByBeneficiary(beneficiaryIds: string[]) {
    if (beneficiaryIds.length === 0) return [];
    return this.prisma.visitInstance.groupBy({
      by: ['beneficiaryId', 'statusLookupValueId'],
      where: { isDeleted: false, beneficiaryId: { in: beneficiaryIds } },
      _count: { _all: true },
    });
  }

  /**
   * Visits per beneficiaryId whose VisitSchedule.scheduledDate falls on
   * `today` and are still in one of `dueOrOverdueStatusLookupValueIds`
   * (PENDING/MISSED — resolved by the service layer, same as
   * countEndingSoon) — for the pada-breakdown widget's visitsRemainingCount
   * ("visits still due today"). Grouped in application code, not a Prisma
   * groupBy, since scheduledDate lives on the related VisitSchedule, not
   * VisitInstance itself — Prisma cannot group by a related model's field
   * directly (same constraint as risk-referral-service's
   * countPendingFollowupsByBeneficiary). An empty `beneficiaryIds` or empty
   * `dueOrOverdueStatusLookupValueIds` returns an empty map (not an error).
   */
  async countDueTodayByBeneficiary(
    beneficiaryIds: string[],
    dueOrOverdueStatusLookupValueIds: string[],
    today: Date,
  ): Promise<Map<string, number>> {
    if (beneficiaryIds.length === 0 || dueOrOverdueStatusLookupValueIds.length === 0) {
      return new Map();
    }

    const rows = await this.prisma.visitInstance.findMany({
      where: {
        isDeleted: false,
        beneficiaryId: { in: beneficiaryIds },
        statusLookupValueId: { in: dueOrOverdueStatusLookupValueIds },
        schedule: { scheduledDate: today },
      },
      select: { beneficiaryId: true },
    });

    const byBeneficiary = new Map<string, number>();
    for (const row of rows) {
      byBeneficiary.set(row.beneficiaryId, (byBeneficiary.get(row.beneficiaryId) ?? 0) + 1);
    }
    return byBeneficiary;
  }

  /**
   * Full visit rows (id, beneficiaryId, visitCode, scheduledDate) for
   * beneficiaries in `beneficiaryIds` whose VisitSchedule.scheduledDate
   * falls on `date` and are still in one of
   * `dueOrOverdueStatusLookupValueIds` (PENDING/MISSED, resolved by the
   * service layer) — for the pada visit-list screen's "open" tab. Unlike
   * countDueTodayByBeneficiary, this is a LIST endpoint (one card per
   * visit), not a count — a beneficiary with 2 due visits that date
   * returns 2 rows, not deduped. An empty `beneficiaryIds` or empty
   * `dueOrOverdueStatusLookupValueIds` returns an empty list (not an error).
   */
  async findByPada(
    beneficiaryIds: string[],
    dueOrOverdueStatusLookupValueIds: string[],
    date: Date,
  ) {
    if (beneficiaryIds.length === 0 || dueOrOverdueStatusLookupValueIds.length === 0) {
      return [];
    }

    return this.prisma.visitInstance.findMany({
      where: {
        isDeleted: false,
        beneficiaryId: { in: beneficiaryIds },
        statusLookupValueId: { in: dueOrOverdueStatusLookupValueIds },
        schedule: { scheduledDate: date },
      },
      select: {
        id: true,
        beneficiaryId: true,
        schedule: { select: { visitCode: true, scheduledDate: true } },
      },
    });
  }

  findScheduleById(scheduleId: string) {
    return this.prisma.visitSchedule.findFirst({
      where: { id: scheduleId, isDeleted: false },
    });
  }

  create(data: CreateVisitInstanceInput) {
    return this.prisma.visitInstance.create({ data });
  }

  /**
   * Applies a status transition, in one transaction with the
   * VisitStatusHistory row that records it. Only updates a row still at
   * `existing.statusLookupValueId` — the same optimistic-concurrency guard
   * `beneficiary.repository.ts`'s `reactivateCase` uses: if the visit's
   * status already changed between the caller's findById and this call,
   * `count` comes back 0 and the service turns that into a 409 instead of
   * silently overwriting a since-changed visit.
   */
  async updateStatus(
    id: string,
    fromStatusLookupValueId: string | null,
    data: UpdateVisitInstanceInput & { completedAt: Date | null },
    changedByUserId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.visitInstance.updateMany({
        where: { id, isDeleted: false, statusLookupValueId: fromStatusLookupValueId },
        data: {
          statusLookupValueId: data.statusLookupValueId,
          actualVisitDate: data.actualVisitDate,
          meetBeneficiaryFlag: data.meetBeneficiaryFlag,
          notMetReason: data.notMetReason,
          completedAt: data.completedAt,
        },
      });
      if (result.count === 0) return false;

      await tx.visitStatusHistory.create({
        data: {
          visitId: id,
          fromStatusLookupValueId,
          toStatusLookupValueId: data.statusLookupValueId,
          changedByUserId,
          changedAt: new Date(),
        },
      });
      return true;
    });
  }
}
