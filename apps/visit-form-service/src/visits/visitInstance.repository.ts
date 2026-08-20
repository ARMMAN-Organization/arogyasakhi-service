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
   * The beneficiary's `limit` most-recently-completed INC-type visits
   * (visitType NEONATAL_VISIT/INC_VISIT's schedule-level VisitCodeType,
   * INC/INC_HR), most recent first — used by BR-13's CCV opening-risk-state
   * resolver, which needs "the last 3 completed INC visits" specifically,
   * not just any 3 visits. "Completed" means `completedAt` is set — a
   * scheduled-but-not-yet-submitted visit row doesn't count. Joins through
   * VisitSchedule for visitType since VisitInstance itself carries no
   * phase/type column of its own. Ordered by completedAt (not
   * actualVisitDate) — the same "completed" column the where clause filters
   * on, and the convention findRecentCompletedVisits below uses; a visit
   * conducted earlier but submitted/completed later must not outrank a more
   * recently completed one, since recentIncVisits[0] is treated as *the
   * most recent* completed INC visit for mostRecentIncVisitHrType.
   */
  findRecentCompletedIncVisits(beneficiaryId: string, limit: number) {
    return this.prisma.visitInstance.findMany({
      where: {
        beneficiaryId,
        isDeleted: false,
        completedAt: { not: null },
        schedule: { visitType: { in: ['INC', 'INC_HR'] } },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Every completed INC-type visit id in the beneficiary's 0-12m window
   * (NN/INC/INC_HR — the full infant-tracking period BR-13's "was HR ever
   * detected in 0-12m" scan covers, per ccv.rulesJson.ts's own doc comment),
   * for the CCV opening-risk-state resolver to check each against
   * risk-referral-service's hrDetectedFlag. Ids only (not full rows) — the
   * caller batches these into one GET /risk-assessments call.
   */
  async findAllCompletedInfantVisitIds(beneficiaryId: string): Promise<string[]> {
    const visits = await this.prisma.visitInstance.findMany({
      where: {
        beneficiaryId,
        isDeleted: false,
        completedAt: { not: null },
        schedule: { visitType: { in: ['NN', 'INC', 'INC_HR'] } },
      },
      select: { id: true },
    });
    return visits.map((v) => v.id);
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
  async countByBeneficiary(
    beneficiaryIds: string[],
    scoping: { sakhiId?: string; sakhiIds?: string[] },
  ) {
    if (beneficiaryIds.length === 0) return [];
    return this.prisma.visitInstance.groupBy({
      by: ['beneficiaryId', 'statusLookupValueId'],
      where: {
        isDeleted: false,
        beneficiaryId: { in: beneficiaryIds },
        ...(scoping.sakhiId ? { sakhiId: scoping.sakhiId } : {}),
        ...(scoping.sakhiIds ? { sakhiId: { in: scoping.sakhiIds } } : {}),
      },
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
    scoping: { sakhiId?: string; sakhiIds?: string[] },
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
        ...(scoping.sakhiId ? { sakhiId: scoping.sakhiId } : {}),
        ...(scoping.sakhiIds ? { sakhiId: { in: scoping.sakhiIds } } : {}),
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
   * beneficiaries in `beneficiaryIds` — for the pada visit-list screen's
   * "open" tab. A PENDING visit only counts if it's due exactly on `date`
   * (it isn't "open" before its scheduled date). A MISSED visit counts if
   * its scheduledDate falls on or BEFORE `date` — once a visit is marked
   * MISSED it has no actualVisitDate, but per countByStatus's documented
   * semantics it must still be countable/visible within the period it was
   * due in, so an overdue MISSED visit from an earlier date must not
   * disappear from today's "open" tab just because `date` defaults to
   * today. Unlike countDueTodayByBeneficiary, this is a LIST endpoint (one
   * card per visit), not a count — a beneficiary with 2 due visits that
   * date returns 2 rows, not deduped. Empty `beneficiaryIds` or empty
   * `pendingStatusLookupValueIds`+`missedStatusLookupValueIds` returns an
   * empty list (not an error).
   */
  async findByPada(
    beneficiaryIds: string[],
    pendingStatusLookupValueIds: string[],
    missedStatusLookupValueIds: string[],
    date: Date,
    scoping: { sakhiId?: string; sakhiIds?: string[] },
  ) {
    if (
      beneficiaryIds.length === 0 ||
      (pendingStatusLookupValueIds.length === 0 && missedStatusLookupValueIds.length === 0)
    ) {
      return [];
    }

    const sakhiScope = scoping.sakhiId
      ? { sakhiId: scoping.sakhiId }
      : scoping.sakhiIds
        ? { sakhiId: { in: scoping.sakhiIds } }
        : {};

    return this.prisma.visitInstance.findMany({
      where: {
        isDeleted: false,
        beneficiaryId: { in: beneficiaryIds },
        ...sakhiScope,
        OR: [
          ...(pendingStatusLookupValueIds.length > 0
            ? [
                {
                  statusLookupValueId: { in: pendingStatusLookupValueIds },
                  schedule: { scheduledDate: date },
                },
              ]
            : []),
          ...(missedStatusLookupValueIds.length > 0
            ? [
                {
                  statusLookupValueId: { in: missedStatusLookupValueIds },
                  schedule: { scheduledDate: { lte: date } },
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        beneficiaryId: true,
        schedule: { select: { visitCode: true, scheduledDate: true } },
      },
    });
  }

  /**
   * The beneficiary's `limit` most-recently-completed visits (newest
   * `completedAt` first), for GET /beneficiaries/:beneficiaryId/visit-history
   * (FR-S-4.6 — pre-visit vitals). "Completed" means `completedAt` is set,
   * same convention as findRecentCompletedIncVisits — a scheduled-but-not-
   * yet-submitted or in-progress visit doesn't count. Optionally narrowed to
   * a set of formCodes (resolved by the service layer from the caller's own
   * formCode/visitType query params via visit-code-form-map.ts) via the
   * linked FormSubmission's own formVersion.formDefinition.formCode — this
   * table has no formCode column of its own. Includes each visit's most
   * recent non-deleted FormSubmission (there is normally exactly one per
   * visit; `take: 1` + `orderBy submittedAt desc` guards against a
   * theoretical resubmission leaving more than one row) so the service
   * layer can extract vitals without a second round trip.
   */
  findRecentCompletedVisits(beneficiaryId: string, formCodes: string[] | undefined, limit: number) {
    return this.prisma.visitInstance.findMany({
      where: {
        beneficiaryId,
        isDeleted: false,
        completedAt: { not: null },
        ...(formCodes && formCodes.length > 0
          ? {
              formSubmissions: {
                some: {
                  isDeleted: false,
                  formVersion: { formDefinition: { formCode: { in: formCodes } } },
                },
              },
            }
          : {}),
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
      include: {
        schedule: { select: { visitCode: true } },
        formSubmissions: {
          where: { isDeleted: false },
          orderBy: { submittedAt: 'desc' },
          take: 1,
          include: { formVersion: { include: { formDefinition: true } } },
        },
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
