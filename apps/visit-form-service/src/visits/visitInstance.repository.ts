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

  /**
   * Full visit history for one beneficiary (Beneficiary Data Download screen
   * — offline reference, so no take/limit: a Sakhi needs the complete
   * history, not just the most recent page). Ordered by actualVisitDate
   * desc, nulls last: most-recently-conducted visits first, with visits that
   * never happened (MISSED, no actualVisitDate) trailing at the end rather
   * than sorting unpredictably against dated rows. Excludes soft-deleted
   * rows, matching findById/findScheduleById's isDeleted convention (unlike
   * findMany() above, which is a "recent activity" feed where that filter
   * was never added).
   */
  findManyByBeneficiaryId(beneficiaryId: string) {
    return this.prisma.visitInstance.findMany({
      where: { beneficiaryId, isDeleted: false },
      orderBy: { actualVisitDate: { sort: 'desc', nulls: 'last' } },
    });
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
