import type { PrismaService } from '../prisma/prisma.service';
import type { BeneficiaryStatus, CasePhase, CaseType, Sex } from './beneficiary.constants';

export interface BeneficiaryListFilters {
  projectId?: string;
  villageId?: string;
  padaId?: string;
  currentStatus?: BeneficiaryStatus;
  caseType?: CaseType;
  /** True to return only cases with `everAtRiskFlag` set on any risk condition. */
  atRiskOnly?: boolean;
  /** hashForSearch(normalizeForSearch(name)) — exact-match only, see findMany's doc comment. */
  nameHash?: Buffer;
  /** hashForSearch(normalizeForSearch(mobileNumber)) — exact-match only. */
  phoneHash?: Buffer;
}

export interface DuplicateSearchTokens {
  nameToken: Buffer;
  caseTypeLookupId: string;
  dobToken: string | null;
  phoneHash: Buffer | null;
  geographyToken: string | null;
  lmpDateToken: string | null;
}

export interface PiiCreateData {
  fullNameEnc: Buffer;
  fullNameSearchHash: Buffer;
  phoneEnc: Buffer | null;
  phoneSearchHash: Buffer | null;
  alternatePhoneEnc: Buffer | null;
  villageId: string | null;
  padaId: string | null;
  healthSubCentreId: string | null;
  phcId: string | null;
  healthBlockId: string | null;
  dateOfBirth: Date | null;
  sex: Sex | null;
  addressLineEnc: Buffer | null;
  stateId: string | null;
  districtId: string | null;
  talukaId: string | null;
  rchNumberEnc: Buffer | null;
  rchNumberHash: Buffer | null;
}

export interface CaseCreateData {
  localCaseUuid: string;
  projectId: string;
  sakhiId: string;
  caseType: CaseType;
  registrationDate: Date;
  previousBeneficiaryId: string | null;
  motherBeneficiaryId: string | null;
  beneficiaryTypeLookupId: string;
  caseTypeLookupId: string;
  journeyStartDate: Date;
  currentPhase: CasePhase;
}

export interface MotherDetailsCreateData {
  lmpDate: Date;
  eddDate: Date;
  gravida: number | null;
  parity: number | null;
  heightCm: number | null;
  bmiAtRegistration: number | null;
}

export interface ChildDetailsCreateData {
  motherBeneficiaryId: string | null;
  dateOfBirth: Date;
  sex: Sex | null;
  birthWeightKg: number | null;
  birthLengthCm: number | null;
  prematureFlag: boolean | null;
  linkedAncCase: boolean;
}

export interface CreateEnrollmentInput {
  pii: PiiCreateData;
  case: CaseCreateData;
  motherDetails: MotherDetailsCreateData | null;
  childDetails: ChildDetailsCreateData | null;
  searchTokens: DuplicateSearchTokens;
  consentDate: Date;
  consentCapturedByUserId: string;
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
      include: { beneficiaryCase: { include: { pii: true } } },
    });

    const phoneHash = tokens.phoneHash;
    if (!phoneHash) return candidates.find((c) => !c.beneficiaryCase.isDeleted) ?? null;

    return (
      candidates.find(
        (c) =>
          !c.beneficiaryCase.isDeleted && c.beneficiaryCase.pii.phoneSearchHash?.equals(phoneHash),
      ) ?? null
    );
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
