import type { PrismaService } from '../prisma/prisma.service';
import type {
  CasePhase,
  CaseType,
  CcvOpeningRiskState,
  ChildCasePhase,
} from './beneficiary.constants';
import type {
  BeneficiaryListFilters,
  BeneficiarySummaryFilters,
  CreateEnrollmentInput,
  DuplicateSearchTokens,
  UpsertRiskConditionSummaryData,
} from './beneficiary.repository.types';

// Re-exported so existing importers of `./beneficiary.repository` keep working;
// the interface definitions live in beneficiary.repository.types.ts.
export type {
  BeneficiaryListFilters,
  BeneficiaryListPage,
  CaseCreateData,
  ChildDetailsCreateData,
  CreateEnrollmentInput,
  DuplicateSearchTokens,
  MotherDetailsCreateData,
  PiiCreateData,
} from './beneficiary.repository.types';

interface ListCursor {
  createdAt: string;
  id: string;
}

/** Encodes a row's sort key as an opaque pagination cursor. */
function encodeCursor(row: { createdAt: Date; id: string }): string {
  const cursor: ListCursor = { createdAt: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Decodes a cursor produced by encodeCursor; returns null on any malformed input. */
function decodeCursor(cursor: string): ListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.createdAt === 'string' && typeof parsed?.id === 'string') {
      return parsed as ListCursor;
    }
    return null;
  } catch {
    return null;
  }
}

/** Data-access layer for beneficiary cases. Only this domain touches these tables. */
export class BeneficiaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists beneficiary cases with the filters SRS FR-S-9.2 / HLD's endpoint
   * table require: project, geography (village/pada), status, case type, and
   * risk level, plus name/mobile search. Name/mobile are encrypted at rest
   * (no plaintext column to filter on), so search matches the same
   * non-reversible hash used for duplicate detection — exact match on the
   * normalized value, not a partial/fuzzy match.
   *
   * Cursor pagination sorts by (createdAt desc, id desc) — createdAt alone
   * isn't guaranteed unique, so the id tiebreaks it into a stable order. A
   * page fetches `limit + 1` rows to detect whether a next page exists
   * without a separate count query; the extra row is trimmed before
   * returning. An unparseable `filters.cursor` is treated as "start from the
   * beginning" — a stale/corrupted cursor value degrades to a fresh first
   * page rather than a hard failure.
   */
  async findMany(filters: BeneficiaryListFilters) {
    const where: NonNullable<Parameters<typeof this.prisma.beneficiaryCase.findMany>[0]>['where'] =
      {
        isDeleted: false,
      };
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.currentStatus) where.currentStatus = filters.currentStatus;
    if (filters.caseType) where.caseType = filters.caseType;
    if (filters.villageId || filters.padaId || filters.nameHash || filters.phoneHash) {
      where.pii = {
        ...(filters.villageId ? { villageId: filters.villageId } : {}),
        ...(filters.padaId ? { padaId: filters.padaId } : {}),
        ...(filters.nameHash ? { fullNameSearchHash: filters.nameHash } : {}),
        ...(filters.phoneHash ? { phoneSearchHash: filters.phoneHash } : {}),
      };
    }
    if (filters.atRiskOnly) {
      where.riskConditionSummaries = { some: { everAtRiskFlag: true } };
    }
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };
    if (filters.fromDate || filters.toDate) {
      where.registrationDate = {
        ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00.000Z`) } : {}),
        ...(filters.toDate ? { lte: new Date(`${filters.toDate}T23:59:59.999Z`) } : {}),
      };
    }

    const decodedCursor = filters.cursor ? decodeCursor(filters.cursor) : null;

    const rows = await this.prisma.beneficiaryCase.findMany({
      where: decodedCursor
        ? {
            ...where,
            OR: [
              { createdAt: { lt: new Date(decodedCursor.createdAt) } },
              { createdAt: new Date(decodedCursor.createdAt), id: { lt: decodedCursor.id } },
            ],
          }
        : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      include: { pii: true, motherCaseDetails: true, childCaseDetails: true },
    });

    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;
    const lastItem = items[items.length - 1];
    return { items, nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null };
  }

  /**
   * Returns the bare ids of in-scope beneficiary cases — no PII, no
   * pagination — for other services (e.g. risk-referral-service's
   * referral-summary) that need to filter their own tables by beneficiaryId
   * but can't join across the forklift boundary. Same sakhiId/sakhiIds
   * role-scoping as findMany/countByCaseType.
   */
  async findIds(filters: { sakhiId?: string; sakhiIds?: string[] }): Promise<string[]> {
    const where: NonNullable<Parameters<typeof this.prisma.beneficiaryCase.findMany>[0]>['where'] =
      { isDeleted: false };
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };

    const rows = await this.prisma.beneficiaryCase.findMany({ where, select: { id: true } });
    return rows.map((r) => r.id);
  }

  /**
   * Groups in-scope beneficiaries (id + caseType) by their pii.padaId — for
   * the pada breakdown widget's Women/Child split. A beneficiary with no
   * padaId on record is excluded entirely (not grouped under a synthetic
   * bucket) — per the widget's contract, a pada row needs a padaId to be
   * usable as a list key/nav arg. Same sakhiId/sakhiIds role-scoping as
   * findIds. caseType is included (not just the bare id) so the caller can
   * split due/overdue/referral counts into womenCount/childCount without a
   * second round-trip.
   */
  async findIdsGroupedByPada(filters: {
    sakhiId?: string;
    sakhiIds?: string[];
  }): Promise<Map<string, { id: string; caseType: CaseType }[]>> {
    const where: NonNullable<Parameters<typeof this.prisma.beneficiaryCase.findMany>[0]>['where'] =
      { isDeleted: false, pii: { padaId: { not: null } } };
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };

    const rows = await this.prisma.beneficiaryCase.findMany({
      where,
      select: { id: true, caseType: true, pii: { select: { padaId: true } } },
    });

    const byPada = new Map<string, { id: string; caseType: CaseType }[]>();
    for (const row of rows) {
      const padaId = row.pii.padaId;
      if (!padaId) continue;
      const entry = { id: row.id, caseType: row.caseType };
      const existing = byPada.get(padaId);
      if (existing) {
        existing.push(entry);
      } else {
        byPada.set(padaId, [entry]);
      }
    }
    return byPada;
  }

  /**
   * Counts in-scope beneficiary cases by caseType for the Registration
   * Summary widget — same role-scoping/date-range semantics as findMany's
   * `sakhiId`/`sakhiIds`/`fromDate`/`toDate` filters, just no pagination or
   * detail rows since this is a count-only aggregate.
   */
  async countByCaseType(filters: BeneficiarySummaryFilters) {
    const where: NonNullable<Parameters<typeof this.prisma.beneficiaryCase.groupBy>[0]>['where'] = {
      isDeleted: false,
    };
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };
    if (filters.fromDate || filters.toDate) {
      where.registrationDate = {
        ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00.000Z`) } : {}),
        ...(filters.toDate ? { lte: new Date(`${filters.toDate}T23:59:59.999Z`) } : {}),
      };
    }

    const activeWhere = { ...where, currentStatus: 'ACTIVE' as const };
    const [grouped, activeGrouped, activeHighRiskGrouped] = await Promise.all([
      this.prisma.beneficiaryCase.groupBy({
        by: ['caseType'],
        where,
        _count: { _all: true },
      }),
      this.prisma.beneficiaryCase.groupBy({
        by: ['caseType'],
        where: activeWhere,
        _count: { _all: true },
      }),
      this.prisma.beneficiaryCase.groupBy({
        by: ['caseType'],
        where: { ...activeWhere, currentSummary: { latestVisitHighRiskFlag: true } },
        _count: { _all: true },
      }),
    ]);

    const motherCount = grouped.find((g) => g.caseType === 'MOTHER')?._count._all ?? 0;
    const childCount = grouped.find((g) => g.caseType === 'CHILD')?._count._all ?? 0;
    const activeMothersCount = activeGrouped.find((g) => g.caseType === 'MOTHER')?._count._all ?? 0;
    const activeChildrenCount = activeGrouped.find((g) => g.caseType === 'CHILD')?._count._all ?? 0;
    const activeMothersHighRiskCount =
      activeHighRiskGrouped.find((g) => g.caseType === 'MOTHER')?._count._all ?? 0;
    const activeChildrenHighRiskCount =
      activeHighRiskGrouped.find((g) => g.caseType === 'CHILD')?._count._all ?? 0;
    const totalActiveBeneficiaries = activeMothersCount + activeChildrenCount;

    return {
      total: motherCount + childCount,
      motherCount,
      childCount,
      totalActiveBeneficiaries,
      activeMothersCount,
      activeChildrenCount,
      activeMothersHighRiskCount,
      activeChildrenHighRiskCount,
      activeMothersPercent:
        totalActiveBeneficiaries === 0 ? 0 : (activeMothersCount / totalActiveBeneficiaries) * 100,
      activeChildrenPercent:
        totalActiveBeneficiaries === 0 ? 0 : (activeChildrenCount / totalActiveBeneficiaries) * 100,
    };
  }

  /**
   * Counts in-scope beneficiaries' latest risk grade per condition for the
   * Risk Summary widget. Counts per-condition (one BeneficiaryRiskConditionSummary
   * row per beneficiary+condition), not collapsed to one grade per beneficiary
   * — matches the table's own grain.
   */
  async countByRiskGrade(filters: BeneficiarySummaryFilters) {
    const caseWhere: NonNullable<
      Parameters<typeof this.prisma.beneficiaryCase.findMany>[0]
    >['where'] = { isDeleted: false };
    if (filters.sakhiId) caseWhere.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) caseWhere.sakhiId = { in: filters.sakhiIds };
    if (filters.fromDate || filters.toDate) {
      caseWhere.registrationDate = {
        ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00.000Z`) } : {}),
        ...(filters.toDate ? { lte: new Date(`${filters.toDate}T23:59:59.999Z`) } : {}),
      };
    }

    const summaries = await this.prisma.beneficiaryRiskConditionSummary.findMany({
      where: { beneficiaryCase: caseWhere },
      select: { latestGrade: true, everAtRiskFlag: true, currentReferralTriggerFlag: true },
    });

    const byGrade: Record<string, number> = {};
    let everAtRiskCount = 0;
    let referralTriggerCount = 0;
    for (const summary of summaries) {
      const grade = summary.latestGrade ?? 'UNGRADED';
      byGrade[grade] = (byGrade[grade] ?? 0) + 1;
      if (summary.everAtRiskFlag) everAtRiskCount++;
      if (summary.currentReferralTriggerFlag) referralTriggerCount++;
    }

    return { total: summaries.length, byGrade, everAtRiskCount, referralTriggerCount };
  }

  /**
   * Upserts the per-condition risk rollup pushed by risk-referral-service
   * after it evaluates a submission (see the ERD's derivation note on
   * Beneficiary_risk_condition_summary: "not the source of truth... updated
   * after every applicable visit/risk evaluation"). `latest*` always
   * updates; `baseline*` is set only on first insert (never overwritten —
   * baseline is a point-in-time snapshot); `everHighest*`/`everAtRiskFlag`
   * only move toward "more severe," never back down, once any non-NORMAL
   * grade has ever been recorded. `currentReferralTriggerFlag`/
   * `currentHrVisitTriggerFlag` always reflect only the latest push, not an
   * "ever" history.
   *
   * Uses the (beneficiaryId, riskConditionId) unique constraint for a real
   * upsert — no separate find-then-write race window.
   */
  async upsertRiskConditionSummary(beneficiaryId: string, data: UpsertRiskConditionSummaryData) {
    const existing = await this.prisma.beneficiaryRiskConditionSummary.findUnique({
      where: {
        beneficiaryId_riskConditionId: { beneficiaryId, riskConditionId: data.riskConditionId },
      },
    });

    // A null grade means this is a self-reported, ungraded entry (e.g.
    // enrollment-time diagnosed conditions/sickle cell status) rather than a
    // rule-engine evaluation — always at-risk (a reported condition is
    // inherently a risk signal) and never grade-ranked against the existing
    // row, since there is no rank to compare.
    const isEverAtRisk = data.grade !== 'NORMAL' || (existing?.everAtRiskFlag ?? false);
    const outranksEverHighest =
      data.gradeRank !== null &&
      (existing?.everHighestGradeRank == null || data.gradeRank > existing.everHighestGradeRank);

    return this.prisma.beneficiaryRiskConditionSummary.upsert({
      where: {
        beneficiaryId_riskConditionId: { beneficiaryId, riskConditionId: data.riskConditionId },
      },
      create: {
        beneficiaryId,
        riskConditionId: data.riskConditionId,
        phase: data.phase as never,
        baselineGrade: data.grade,
        baselineObservedValueJson: data.observedValueJson ?? undefined,
        baselineVisitId: data.visitId,
        baselineSubmissionId: data.submissionId,
        baselineAssessedAt: data.assessedAt,
        latestGrade: data.grade,
        latestGradeRank: data.gradeRank,
        latestObservedValueJson: data.observedValueJson ?? undefined,
        latestVisitId: data.visitId,
        latestSubmissionId: data.submissionId,
        latestAssessedAt: data.assessedAt,
        everHighestGrade: data.grade,
        everHighestGradeRank: data.gradeRank,
        everHighestObservedValueJson: data.observedValueJson ?? undefined,
        everHighestVisitId: data.visitId,
        everHighestSubmissionId: data.submissionId,
        everHighestAssessedAt: data.assessedAt,
        everAtRiskFlag: isEverAtRisk,
        currentReferralTriggerFlag: data.isReferralTrigger,
        currentHrVisitTriggerFlag: data.isHrVisitTrigger,
        isFirstInstance: data.isFirstInstance,
        consecutiveNoImprovementCount: data.consecutiveNoImprovementCount,
        sourceRuleVersionId: data.ruleVersionId,
      },
      update: {
        phase: data.phase as never,
        latestGrade: data.grade,
        latestGradeRank: data.gradeRank,
        latestObservedValueJson: data.observedValueJson ?? undefined,
        latestVisitId: data.visitId,
        latestSubmissionId: data.submissionId,
        latestAssessedAt: data.assessedAt,
        everAtRiskFlag: isEverAtRisk,
        ...(outranksEverHighest
          ? {
              everHighestGrade: data.grade,
              everHighestGradeRank: data.gradeRank,
              everHighestObservedValueJson: data.observedValueJson ?? undefined,
              everHighestVisitId: data.visitId,
              everHighestSubmissionId: data.submissionId,
              everHighestAssessedAt: data.assessedAt,
            }
          : {}),
        currentReferralTriggerFlag: data.isReferralTrigger,
        currentHrVisitTriggerFlag: data.isHrVisitTrigger,
        // Always-latest, same as currentReferralTriggerFlag/
        // currentHrVisitTriggerFlag above — not part of the everHighest
        // "only move toward more severe" rollup.
        isFirstInstance: data.isFirstInstance,
        consecutiveNoImprovementCount: data.consecutiveNoImprovementCount,
        sourceRuleVersionId: data.ruleVersionId,
      },
    });
  }

  /**
   * Bare `{id, sakhiId, caseType}` for an ownership check — deliberately NOT
   * `findById`'s full projection (pii/risk/socio/status enrichment), which
   * would pull in `GET /beneficiaries/:id`'s own cross-service calls (e.g.
   * visit-form-service's latest-visit-vitals resolver, which itself calls
   * back into THIS lookup to verify ownership — see
   * form.service.ts/beneficiary.client.ts's own comment on the loop this
   * exists to break). Any caller doing only an ownership check must use
   * this, never findById, or a caller that itself triggers vitals
   * resolution recreates the same infinite request cycle.
   */
  findOwnershipById(id: string) {
    return this.prisma.beneficiaryCase.findFirst({
      where: { id, isDeleted: false },
      select: { id: true, sakhiId: true, caseType: true },
    });
  }

  findById(id: string) {
    return this.prisma.beneficiaryCase.findFirst({
      where: { id, isDeleted: false },
      include: {
        pii: true,
        motherCaseDetails: true,
        childCaseDetails: true,
        consentRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
        // Per the HLD's endpoint table ("Beneficiary profile, current phase,
        // last visits, risk state") — the detail view needs risk state and a
        // status timeline, not just the case/PII/consent rows.
        riskConditionSummaries: true,
        statusHistory: { orderBy: { changedAt: 'desc' } },
        socioDemographics: true,
      },
    });
  }

  /**
   * Finds a case previously created from this exact client-generated
   * `localCaseUuid` — lets `create()` treat a dropped-connection retry of
   * `POST /beneficiaries` as an idempotent replay instead of a new
   * enrollment. Same include shape as `createEnrollment`'s return value so
   * a replay response looks identical to the original create response.
   */
  findByLocalCaseUuid(localCaseUuid: string) {
    return this.prisma.beneficiaryCase.findFirst({
      where: { localCaseUuid, isDeleted: false },
      include: {
        pii: true,
        motherCaseDetails: true,
        childCaseDetails: true,
        consentRecords: true,
        riskConditionSummaries: true,
        statusHistory: { orderBy: { changedAt: 'desc' } },
        socioDemographics: true,
      },
    });
  }

  /**
   * Finds an existing case whose PII/search tokens match ALL of the caller's
   * available tokens simultaneously (per FR-S-2.4). Legs the caller doesn't
   * supply (e.g. no phone given) are skipped rather than treated as a match.
   * Always scoped to caseTypeLookupId (per the ERD's required index) so a
   * MOTHER registration's tokens are never matched against a CHILD case's.
   */
  async findDuplicateCandidate(tokens: DuplicateSearchTokens) {
    const where: NonNullable<
      Parameters<typeof this.prisma.beneficiarySearchToken.findFirst>[0]
    >['where'] = {
      nameToken: tokens.nameToken.toString('base64'),
      caseTypeLookupId: tokens.caseTypeLookupId,
    };
    if (tokens.dobToken) where.dobToken = tokens.dobToken;
    if (tokens.geographyToken) where.geographyToken = tokens.geographyToken;
    if (tokens.lmpDateToken) where.lmpDateToken = tokens.lmpDateToken;

    const candidates = await this.prisma.beneficiarySearchToken.findMany({
      where,
      // currentSummary carries the matched case's delivery/closure/status/LMP,
      // which FR-S-2.4 (new-pregnancy-vs-hard-duplicate) and FR-S-2.5
      // (re-enrolment prompt) need to decide how to handle the match.
      include: { beneficiaryCase: { include: { pii: true, currentSummary: true } } },
    });

    const phoneHash = tokens.phoneHash;
    const matchedToken = !phoneHash
      ? candidates.find((c) => !c.beneficiaryCase.isDeleted)
      : candidates.find(
          (c) =>
            !c.beneficiaryCase.isDeleted &&
            c.beneficiaryCase.pii.phoneSearchHash?.equals(phoneHash),
        );

    return matchedToken?.beneficiaryCase ?? null;
  }

  async createEnrollment(input: CreateEnrollmentInput) {
    return this.prisma.$transaction(async (tx) => {
      const pii = await tx.beneficiaryPii.create({ data: input.pii });

      const beneficiaryCase = await tx.beneficiaryCase.create({
        data: {
          piiId: pii.id,
          currentStatus: 'ACTIVE',
          ...input.case,
        },
      });

      if (input.motherDetails) {
        await tx.motherCaseDetails.create({
          data: { beneficiaryId: beneficiaryCase.id, ...input.motherDetails },
        });
      }

      if (input.childDetails) {
        await tx.childCaseDetails.create({
          data: { beneficiaryId: beneficiaryCase.id, ...input.childDetails },
        });
      }

      if (input.socioDemographics) {
        await tx.beneficiarySocioDemographics.create({
          data: { beneficiaryId: beneficiaryCase.id, ...input.socioDemographics },
        });
      }

      await tx.beneficiarySearchToken.create({
        data: {
          beneficiaryId: beneficiaryCase.id,
          nameToken: input.searchTokens.nameToken.toString('base64'),
          dobToken: input.searchTokens.dobToken,
          lmpDateToken: input.searchTokens.lmpDateToken,
          geographyToken: input.searchTokens.geographyToken,
          caseTypeLookupId: input.case.caseTypeLookupId,
        },
      });

      await tx.consentRecord.create({
        data: {
          beneficiaryId: beneficiaryCase.id,
          consentType: 'PROGRAM_ENROLLMENT',
          consentStatus: 'GIVEN',
          consentDate: input.consentDate,
          capturedByUserId: input.consentCapturedByUserId,
        },
      });

      // riskConditionSummaries/statusHistory aren't included here: nothing
      // has accrued yet for a case created in this same transaction (risk
      // evaluation and status transitions only happen after visits/status
      // changes) — the service fills in empty arrays for those.
      return tx.beneficiaryCase.findUniqueOrThrow({
        where: { id: beneficiaryCase.id },
        include: {
          pii: true,
          motherCaseDetails: true,
          childCaseDetails: true,
          consentRecords: true,
          socioDemographics: true,
        },
      });
    });
  }

  /**
   * Creates or updates the 1:1 socio-demographics row for a beneficiary.
   * Only the supplied keys are written — an update never nulls a column the
   * caller didn't mention, so a partial form submission can't erase an answer
   * captured earlier at enrollment.
   */
  upsertSocioDemographics(beneficiaryId: string, data: Record<string, unknown>) {
    return this.prisma.beneficiarySocioDemographics.upsert({
      where: { beneficiaryId },
      create: { beneficiaryId, ...data },
      update: data,
    });
  }

  /**
   * Updates an existing mother case's LMP/EDD after an approved LMP_CHANGE
   * (FR-SV-4.2). Returns null if no `mother_case_details` row exists for this
   * beneficiary — the service turns that into a 404, since there is nothing
   * to update (a CHILD case, or a MOTHER case with no details row yet).
   */
  async updateMotherLmp(beneficiaryId: string, lmpDate: Date, eddDate: Date) {
    const result = await this.prisma.motherCaseDetails.updateMany({
      where: { beneficiaryId },
      data: { lmpDate, eddDate },
    });
    return result.count > 0;
  }

  /**
   * Advances currentPhase (CR-041) — only if the case is still at
   * `fromPhase` when this runs. Same optimistic-concurrency shape as
   * reactivateCase: the `where` clause is the guard (not a separate
   * read-then-write), so a case whose phase already changed between the
   * service's findById and this call returns count 0 and the service turns
   * that into a 409 instead of silently overwriting a since-changed case.
   *
   * For a CHILD case, also advances `ChildCaseDetails.currentPhase` to the
   * same value in the same transaction — the two columns must never drift:
   * `BeneficiaryCase.currentPhase` is the case-level phase every case type
   * shares, `ChildCaseDetails.currentPhase` is the CHILD-specific mirror the
   * detail API (`GET /beneficiaries/:id`) actually returns. A MOTHER case
   * has no `ChildCaseDetails` row, so this second write is skipped for
   * `caseType !== 'CHILD'`.
   */
  async updatePhase(
    beneficiaryId: string,
    caseType: CaseType,
    fromPhase: CasePhase,
    toPhase: CasePhase,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.beneficiaryCase.updateMany({
        where: { id: beneficiaryId, isDeleted: false, currentPhase: fromPhase },
        data: { currentPhase: toPhase },
      });
      if (result.count === 0) return false;

      if (caseType === 'CHILD') {
        // CasePhase (7 values, shared by every case type) is a strict
        // superset of ChildCasePhase (NN/INC/CCV/CLOSED) — the cast is safe
        // here because applyPhaseChange's own transition table never allows
        // a CHILD case's toPhase to be ANC/DELIVERY/PP, only the 4 values
        // both enums share.
        await tx.childCaseDetails.updateMany({
          where: { beneficiaryId },
          data: { currentPhase: toPhase as ChildCasePhase },
        });
      }

      return true;
    });
  }

  /**
   * Writes ChildCaseDetails.ccvOpeningRiskState (BR-13) — a plain
   * updateMany (not conditioned on the current value) since this is a
   * write-once field at the INC->CCV transition, not a state machine with
   * its own guarded transitions like currentPhase. Returns false when no
   * ChildCaseDetails row exists for this beneficiary (a MOTHER case, or a
   * beneficiary id the caller sequenced this call against out of order).
   */
  async setCcvOpeningRiskState(beneficiaryId: string, ccvOpeningRiskState: CcvOpeningRiskState) {
    const result = await this.prisma.childCaseDetails.updateMany({
      where: { beneficiaryId },
      data: { ccvOpeningRiskState },
    });
    return result.count > 0;
  }

  /**
   * Closes a beneficiary case after a closure submission (mobile
   * closure-request backend-needs ticket) — flips currentStatus to CLOSED
   * and records the transition in beneficiary_status_history for audit, in
   * one transaction. Only updates a row that isn't already CLOSED —
   * updateMany's affected count is the concurrency guard, same pattern as
   * reactivateCase. Unlike reactivateCase, a race here (or a retry landing
   * after the case is already CLOSED) is NOT reported as a conflict by this
   * method — it returns false and the service layer re-reads the case to
   * treat "already CLOSED" as an idempotent success, since the mobile app's
   * offline sync may retry this call and a second attempt must not error.
   */
  async closeCase(beneficiaryId: string, closedByUserId: string, reasonCode: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.beneficiaryCase.findFirst({
        where: { id: beneficiaryId, isDeleted: false },
        select: { currentStatus: true },
      });
      if (!existing) return false;
      if (existing.currentStatus === 'CLOSED') return true;

      const result = await tx.beneficiaryCase.updateMany({
        where: { id: beneficiaryId, isDeleted: false, currentStatus: { not: 'CLOSED' } },
        data: { currentStatus: 'CLOSED' },
      });
      if (result.count === 0) return false;

      await tx.beneficiaryStatusHistory.create({
        data: {
          beneficiaryId,
          fromStatus: existing.currentStatus,
          toStatus: 'CLOSED',
          reasonCode,
          changedByUserId: closedByUserId,
          changedAt: new Date(),
        },
      });
      return true;
    });
  }

  /**
   * Missed Visit Escalation TRANSFER (FR-SV-4.3) — moves a case to
   * PENDING_TRANSFER pending a Manager's review, and records the transition
   * in beneficiary_status_history, in one transaction. sakhiId is
   * deliberately untouched by this method (see the PENDING_TRANSFER enum
   * comment in schema.prisma). Idempotent like closeCase: a retry against an
   * already-PENDING_TRANSFER case returns true rather than a spurious
   * false/409, since notification-escalation-service's own decide-endpoint
   * retry could otherwise double-call this. Blocked only from CLOSED — a
   * closed case has nothing left to transfer.
   */
  async markPendingTransfer(beneficiaryId: string, changedByUserId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.beneficiaryCase.findFirst({
        where: { id: beneficiaryId, isDeleted: false },
        select: { currentStatus: true },
      });
      if (!existing) return false;
      if (existing.currentStatus === 'PENDING_TRANSFER') return true;
      if (existing.currentStatus === 'CLOSED') return false;

      const result = await tx.beneficiaryCase.updateMany({
        where: {
          id: beneficiaryId,
          isDeleted: false,
          currentStatus: { notIn: ['CLOSED', 'PENDING_TRANSFER'] },
        },
        data: { currentStatus: 'PENDING_TRANSFER' },
      });
      if (result.count === 0) return false;

      await tx.beneficiaryStatusHistory.create({
        data: {
          beneficiaryId,
          fromStatus: existing.currentStatus,
          toStatus: 'PENDING_TRANSFER',
          reasonCode: 'MISSED_VISIT_ESCALATION_TRANSFER',
          changedByUserId,
          changedAt: new Date(),
        },
      });
      return true;
    });
  }

  /**
   * Reactivates a CLOSED beneficiary case after an approved reopen request
   * (FR-SV-4.7/FR-S-10.3) — flips currentStatus back to ACTIVE and records
   * the transition in beneficiary_status_history for audit, in one
   * transaction. Only updates a row that is still CLOSED — updateMany's
   * affected count (rather than a separate read-then-write) is the
   * concurrency guard: if the case's status already changed between the
   * caller's findById and this call, the count comes back 0 and the service
   * turns that into a 409 instead of silently overwriting a since-changed
   * case. Same pattern as closures/reopen-requests/referrals.
   */
  async reactivateCase(beneficiaryId: string, reactivatedByUserId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.beneficiaryCase.updateMany({
        where: { id: beneficiaryId, isDeleted: false, currentStatus: 'CLOSED' },
        data: { currentStatus: 'ACTIVE' },
      });
      if (result.count === 0) return false;

      await tx.beneficiaryStatusHistory.create({
        data: {
          beneficiaryId,
          fromStatus: 'CLOSED',
          toStatus: 'ACTIVE',
          reasonCode: 'REOPEN_APPROVED',
          changedByUserId: reactivatedByUserId,
          changedAt: new Date(),
        },
      });
      return true;
    });
  }

  /**
   * Decrypted name/phone plus the worst current risk grade, per requested
   * id — for the pada visit-list screen's cards. `ids` is trusted as-is
   * (the caller — api-gateway — has already scoped it, e.g. to one pada's
   * beneficiaries); an id outside that set or not found is simply absent
   * from the result, not a 404. `nameHash` (optional) narrows to beneficiaries
   * whose name matches the screen's search box — same exact-hash-match
   * constraint as GET /beneficiaries (names are encrypted, no partial/fuzzy
   * search). riskGradeRank is the highest `latestGradeRank` across the
   * beneficiary's BeneficiaryRiskConditionSummary rows — null if they have
   * none — the service layer maps this + latestGrade to the 4-bucket
   * riskLevel (none/mild/moderate/high).
   */
  async findByIdsWithRisk(
    ids: string[],
    nameHash: Buffer | undefined,
    scoping: { sakhiId?: string; sakhiIds?: string[] },
  ) {
    if (ids.length === 0) return [];

    const cases = await this.prisma.beneficiaryCase.findMany({
      where: {
        id: { in: ids },
        isDeleted: false,
        ...(scoping.sakhiId ? { sakhiId: scoping.sakhiId } : {}),
        ...(scoping.sakhiIds ? { sakhiId: { in: scoping.sakhiIds } } : {}),
        ...(nameHash ? { pii: { fullNameSearchHash: nameHash } } : {}),
      },
      include: { pii: true },
    });
    if (cases.length === 0) return [];

    const riskRows = await this.prisma.beneficiaryRiskConditionSummary.findMany({
      where: { beneficiaryId: { in: cases.map((c) => c.id) } },
      select: { beneficiaryId: true, latestGrade: true, latestGradeRank: true },
    });
    const worstByBeneficiary = new Map<string, { grade: string | null; rank: number }>();
    for (const row of riskRows) {
      if (row.latestGradeRank === null) continue;
      const existing = worstByBeneficiary.get(row.beneficiaryId);
      if (!existing || row.latestGradeRank > existing.rank) {
        worstByBeneficiary.set(row.beneficiaryId, {
          grade: row.latestGrade,
          rank: row.latestGradeRank,
        });
      }
    }

    return cases.map((c) => ({
      id: c.id,
      fullNameEnc: c.pii.fullNameEnc,
      phoneEnc: c.pii.phoneEnc,
      villageId: c.pii.villageId,
      padaId: c.pii.padaId,
      latestGrade: worstByBeneficiary.get(c.id)?.grade ?? null,
    }));
  }

  /**
   * Batch risk-condition-summary lookup for `GET /beneficiaries/risk-condition-summary`
   * — same two-query, no-per-id-looping shape as findByIdsWithRisk above.
   * `beneficiaryIds` is intersected with `scoping` in the WHERE clause, so an
   * out-of-scope or nonexistent id is silently absent from the result, never
   * a 403/404 (same reasoning as findByIdsWithRisk's own doc comment — never
   * let a caller-supplied id list reveal via an error whether an
   * out-of-scope id exists). A beneficiary with zero
   * BeneficiaryRiskConditionSummary rows still appears in the result with an
   * empty `riskConditionSummaries` array, not omitted.
   */
  async findRiskConditionSummariesByBeneficiaryIds(
    beneficiaryIds: string[],
    scoping: { sakhiId?: string; sakhiIds?: string[] },
  ) {
    if (beneficiaryIds.length === 0) return [];

    const cases = await this.prisma.beneficiaryCase.findMany({
      where: {
        id: { in: beneficiaryIds },
        isDeleted: false,
        ...(scoping.sakhiId ? { sakhiId: scoping.sakhiId } : {}),
        ...(scoping.sakhiIds ? { sakhiId: { in: scoping.sakhiIds } } : {}),
      },
      select: { id: true },
    });
    if (cases.length === 0) return [];

    const summaries = await this.prisma.beneficiaryRiskConditionSummary.findMany({
      where: { beneficiaryId: { in: cases.map((c) => c.id) } },
    });
    const summariesByBeneficiary = new Map<string, typeof summaries>();
    for (const summary of summaries) {
      const existing = summariesByBeneficiary.get(summary.beneficiaryId);
      if (existing) {
        existing.push(summary);
      } else {
        summariesByBeneficiary.set(summary.beneficiaryId, [summary]);
      }
    }

    return cases.map((c) => ({
      beneficiaryId: c.id,
      riskConditionSummaries: summariesByBeneficiary.get(c.id) ?? [],
    }));
  }
}
