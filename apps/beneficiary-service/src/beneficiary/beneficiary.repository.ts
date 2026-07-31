import type { PrismaService } from '../prisma/prisma.service';
import type {
  BeneficiaryListFilters,
  CreateEnrollmentInput,
  DuplicateSearchTokens,
} from './beneficiary.repository.types';

// Re-exported so existing importers of `./beneficiary.repository` keep working;
// the interface definitions live in beneficiary.repository.types.ts.
export type {
  BeneficiaryListFilters,
  CaseCreateData,
  ChildDetailsCreateData,
  CreateEnrollmentInput,
  DuplicateSearchTokens,
  MotherDetailsCreateData,
  PiiCreateData,
} from './beneficiary.repository.types';

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
   */
  findMany(filters: BeneficiaryListFilters) {
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

    return this.prisma.beneficiaryCase.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { pii: true },
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
        },
      });
    });
  }
}
