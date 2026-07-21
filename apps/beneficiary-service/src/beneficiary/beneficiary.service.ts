import { addDays } from '@armman/core';
import {
  conflict,
  decryptPii,
  encryptPii,
  hashForSearch,
  HttpError,
  notFound,
  normalizeForSearch,
  unprocessable,
} from '@armman/service-commons';
import type {
  BeneficiaryRiskConditionSummary,
  BeneficiaryStatusHistory,
} from '../../../../node_modules/.prisma/client-beneficiary-service';
import type { BeneficiaryStatus, CaseType } from './beneficiary.constants';
import type {
  BeneficiaryListFilters,
  BeneficiaryRepository,
  DuplicateSearchTokens,
} from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';

const GESTATION_DAYS = 280;

/** Public list-query params — see ListBeneficiariesQuery in the DTO for validation. */
export interface ListBeneficiariesQuery {
  projectId?: string;
  villageId?: string;
  padaId?: string;
  status?: BeneficiaryStatus;
  caseType?: CaseType;
  atRiskOnly?: boolean;
  /** Raw search text — hashed the same way as duplicate-detection tokens (exact match only). */
  name?: string;
  mobileNumber?: string;
}

/**
 * The shape `findDuplicateCandidate` returns — the matched BeneficiaryCase
 * with just the fields FR-S-2.4/2.5 need off its current summary. Structural
 * (not the full Prisma type) so the decision logic isn't coupled to it.
 */
interface DuplicateMatch {
  id: string;
  currentStatus: string;
  currentSummary: {
    dateOfDelivery: Date | null;
    closureDate: Date | null;
    lmpDate: Date | null;
  } | null;
}

interface PiiRow {
  id: string;
  fullNameEnc: Buffer;
  villageId: string | null;
  padaId: string | null;
  healthSubCentreId: string | null;
  phcId: string | null;
  healthBlockId: string | null;
  dateOfBirth: Date | null;
  sex: string | null;
  stateId: string | null;
  districtId: string | null;
  talukaId: string | null;
}

/**
 * Projects a raw beneficiary_case Prisma row down to EXACTLY the fields the
 * API documents (beneficiaryCaseSchema / beneficiaryCaseDetailSchema in
 * beneficiary.controller.ts), decrypting `pii.fullName` for display. Every
 * level is allow-listed — the case, `pii`, and each nested relation — so
 * internal columns (createdByUserId/updatedByUserId/isDeleted/deletedAt,
 * encrypted/hash PII columns, undocumented case fields like
 * pregnancySequenceNo/journeyEndDate, and nested audit columns) can never
 * leak into a response even as the Prisma rows gain columns.
 *
 * Nested relations are only projected when present, so this serves both the
 * list rows (case + pii only) and the detail view (case + pii + mother/child
 * details + consent + risk/status).
 */
function withDecryptedName<T extends { pii: PiiRow; [k: string]: unknown }>(caseRow: T) {
  const c = caseRow as Record<string, unknown>;
  const pii = caseRow.pii;

  const projected: Record<string, unknown> = {
    id: c.id,
    localCaseUuid: c.localCaseUuid,
    piiId: c.piiId,
    projectId: c.projectId,
    sakhiId: c.sakhiId,
    caseType: c.caseType,
    registrationDate: c.registrationDate,
    currentStatus: c.currentStatus,
    currentPhase: c.currentPhase,
    beneficiaryTypeLookupId: c.beneficiaryTypeLookupId,
    caseTypeLookupId: c.caseTypeLookupId,
    previousBeneficiaryId: c.previousBeneficiaryId,
    motherBeneficiaryId: c.motherBeneficiaryId,
    journeyStartDate: c.journeyStartDate,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    pii: {
      id: pii.id,
      fullName: decryptPii(pii.fullNameEnc),
      villageId: pii.villageId,
      padaId: pii.padaId,
      healthSubCentreId: pii.healthSubCentreId,
      phcId: pii.phcId,
      healthBlockId: pii.healthBlockId,
      dateOfBirth: pii.dateOfBirth,
      sex: pii.sex,
      stateId: pii.stateId,
      districtId: pii.districtId,
      talukaId: pii.talukaId,
    },
  };

  // Nested relations — only projected when the query included them (detail view).
  const mother = c.motherCaseDetails as Record<string, unknown> | null | undefined;
  if (mother !== undefined) {
    projected.motherCaseDetails = mother
      ? {
          lmpDate: mother.lmpDate,
          eddDate: mother.eddDate,
          gravida: mother.gravida,
          parity: mother.parity,
          heightCm: mother.heightCm,
          bmiAtRegistration: mother.bmiAtRegistration,
        }
      : null;
  }
  const child = c.childCaseDetails as Record<string, unknown> | null | undefined;
  if (child !== undefined) {
    projected.childCaseDetails = child
      ? {
          motherBeneficiaryId: child.motherBeneficiaryId,
          dateOfBirth: child.dateOfBirth,
          sex: child.sex,
          birthWeightKg: child.birthWeightKg,
          birthLengthCm: child.birthLengthCm,
          prematureFlag: child.prematureFlag,
          linkedAncCase: child.linkedAncCase,
        }
      : null;
  }
  const consents = c.consentRecords as Record<string, unknown>[] | undefined;
  if (consents !== undefined) {
    projected.consentRecords = consents.map((r) => ({
      consentType: r.consentType,
      consentStatus: r.consentStatus,
      consentDate: r.consentDate,
      capturedByUserId: r.capturedByUserId,
    }));
  }
  const risks = c.riskConditionSummaries as Record<string, unknown>[] | undefined;
  if (risks !== undefined) {
    projected.riskConditionSummaries = risks.map((r) => ({
      riskConditionId: r.riskConditionId,
      phase: r.phase,
      latestGrade: r.latestGrade,
      latestAssessedAt: r.latestAssessedAt,
      everHighestGrade: r.everHighestGrade,
      everAtRiskFlag: r.everAtRiskFlag,
      currentReferralTriggerFlag: r.currentReferralTriggerFlag,
      currentHrVisitTriggerFlag: r.currentHrVisitTriggerFlag,
    }));
  }
  const history = c.statusHistory as Record<string, unknown>[] | undefined;
  if (history !== undefined) {
    projected.statusHistory = history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reasonCode: h.reasonCode,
      changedByUserId: h.changedByUserId,
      changedAt: h.changedAt,
      notes: h.notes,
    }));
  }

  return projected;
}

/** Business logic for the beneficiary enrollment lifecycle. */
export class BeneficiaryService {
  constructor(private readonly repository: BeneficiaryRepository) {}

  /**
   * Lists beneficiary cases per SRS FR-S-9.2 / HLD's filter set (scope
   * enforcement added with the auth layer). Each row's name is decrypted
   * server-side for display — the search hash itself is never returned.
   */
  async list(query: ListBeneficiariesQuery) {
    const filters: BeneficiaryListFilters = {
      projectId: query.projectId,
      villageId: query.villageId,
      padaId: query.padaId,
      currentStatus: query.status,
      caseType: query.caseType,
      atRiskOnly: query.atRiskOnly,
      nameHash: query.name ? hashForSearch(normalizeForSearch(query.name)) : undefined,
      phoneHash: query.mobileNumber
        ? hashForSearch(normalizeForSearch(query.mobileNumber))
        : undefined,
    };

    const cases = await this.repository.findMany(filters);
    return cases.map(withDecryptedName);
  }

  async getById(id: string) {
    const found = await this.repository.findById(id);
    if (!found) throw notFound('Beneficiary case not found.');
    return withDecryptedName(found);
  }

  /**
   * Enrolls a mother or child beneficiary per SRS FR-S-2.1/2.3/2.4/2.5.
   * `capturedByUserId` is the authenticated caller (Sakhi) recording consent.
   */
  async create(dto: CreateBeneficiaryInput, capturedByUserId: string) {
    // Idempotent replay: a dropped-connection retry resubmits the same
    // localCaseUuid the device generated for this enrollment. Return the
    // original case rather than re-running consent/duplicate/create logic —
    // matches how form_submissions/visit_instances treat their own local
    // uuid as "already handled," not a fresh operation.
    const existing = await this.repository.findByLocalCaseUuid(dto.case.localCaseUuid);
    if (existing) return withDecryptedName(existing);

    if (dto.consent.status === 'REFUSED') {
      // Per SRS: "No" halts registration entirely — nothing is persisted.
      throw unprocessable('Consent not received. Registration cannot proceed.');
    }

    const searchTokens = this.buildSearchTokens(dto);

    if (!dto.acknowledgeDuplicate) {
      const match = await this.repository.findDuplicateCandidate(searchTokens);
      if (match) {
        this.evaluateDuplicateMatch(match, dto);
      }
    }

    const motherDetails = dto.motherDetails
      ? {
          lmpDate: dto.motherDetails.lmpDate,
          eddDate: addDays(dto.motherDetails.lmpDate, GESTATION_DAYS),
          gravida: dto.motherDetails.gravida ?? null,
          parity: dto.motherDetails.parity ?? null,
          heightCm: dto.motherDetails.heightCm ?? null,
          bmiAtRegistration: computeBmi(dto.motherDetails.heightCm, dto.motherDetails.weightKg),
        }
      : null;

    const childDetails = dto.childDetails
      ? {
          motherBeneficiaryId: dto.case.motherBeneficiaryId ?? null,
          dateOfBirth: dto.childDetails.dateOfBirth,
          sex: dto.childDetails.sex ?? null,
          birthWeightKg: dto.childDetails.birthWeightKg ?? null,
          birthLengthCm: dto.childDetails.birthLengthCm ?? null,
          prematureFlag: dto.childDetails.prematureFlag ?? null,
          linkedAncCase: Boolean(dto.case.motherBeneficiaryId),
        }
      : null;

    const journeyStartDate = dto.case.registrationDate;
    const currentPhase = dto.case.caseType === 'MOTHER' ? 'ANC' : 'NN';

    const created = await this.repository.createEnrollment({
      pii: {
        fullNameEnc: encryptPii(dto.pii.fullName),
        fullNameSearchHash: hashForSearch(normalizeForSearch(dto.pii.fullName)),
        phoneEnc: dto.pii.phone ? encryptPii(dto.pii.phone) : null,
        phoneSearchHash: dto.pii.phone ? hashForSearch(normalizeForSearch(dto.pii.phone)) : null,
        alternatePhoneEnc: dto.pii.alternatePhone ? encryptPii(dto.pii.alternatePhone) : null,
        villageId: dto.pii.villageId ?? null,
        padaId: dto.pii.padaId ?? null,
        healthSubCentreId: dto.pii.healthSubCentreId ?? null,
        phcId: dto.pii.phcId ?? null,
        healthBlockId: dto.pii.healthBlockId ?? null,
        dateOfBirth: dto.pii.dateOfBirth ?? null,
        sex: dto.pii.sex ?? null,
        addressLineEnc: dto.pii.addressLine ? encryptPii(dto.pii.addressLine) : null,
        stateId: dto.pii.stateId ?? null,
        districtId: dto.pii.districtId ?? null,
        talukaId: dto.pii.talukaId ?? null,
        rchNumberEnc: dto.pii.rchNumber ? encryptPii(dto.pii.rchNumber) : null,
        rchNumberHash: dto.pii.rchNumber
          ? hashForSearch(normalizeForSearch(dto.pii.rchNumber))
          : null,
      },
      case: {
        localCaseUuid: dto.case.localCaseUuid,
        projectId: dto.case.projectId,
        sakhiId: dto.case.sakhiId,
        caseType: dto.case.caseType,
        registrationDate: dto.case.registrationDate,
        previousBeneficiaryId: dto.case.previousBeneficiaryId ?? null,
        motherBeneficiaryId: dto.case.motherBeneficiaryId ?? null,
        beneficiaryTypeLookupId: dto.case.beneficiaryTypeLookupId,
        caseTypeLookupId: dto.case.caseTypeLookupId,
        journeyStartDate,
        currentPhase,
      },
      motherDetails,
      childDetails,
      searchTokens,
      consentDate: dto.consent.date,
      consentCapturedByUserId: capturedByUserId,
    });

    return {
      ...withDecryptedName(created),
      // Nothing has accrued yet for a case created in this same call — risk
      // evaluation and status transitions only happen after visits/status
      // changes (see the repository's comment on the create query).
      riskConditionSummaries: [] as BeneficiaryRiskConditionSummary[],
      statusHistory: [] as BeneficiaryStatusHistory[],
    };
  }

  private buildSearchTokens(dto: CreateBeneficiaryInput): DuplicateSearchTokens {
    const geographyParts = [dto.pii.villageId, dto.pii.padaId].filter(Boolean).join('|');
    const dob = dto.case.caseType === 'CHILD' ? dto.childDetails?.dateOfBirth : dto.pii.dateOfBirth;

    return {
      nameToken: hashForSearch(normalizeForSearch(dto.pii.fullName)),
      caseTypeLookupId: dto.case.caseTypeLookupId,
      dobToken: dob ? hashForSearch(dob.toISOString().slice(0, 10)).toString('base64') : null,
      phoneHash: dto.pii.phone ? hashForSearch(normalizeForSearch(dto.pii.phone)) : null,
      geographyToken: geographyParts
        ? hashForSearch(normalizeForSearch(geographyParts)).toString('base64')
        : null,
      lmpDateToken: dto.motherDetails
        ? hashForSearch(dto.motherDetails.lmpDate.toISOString().slice(0, 10)).toString('base64')
        : null,
    };
  }

  /**
   * Decides how to handle a duplicate-detection match, per SRS FR-S-2.4/2.5.
   * Throws to block or prompt; returns normally to allow the enrollment.
   *
   * The matched case's `currentSummary` carries delivery/closure/status/LMP.
   *
   * - FR-S-2.5 (re-enrolment): matched case is JOURNEY_COMPLETE/CLOSED, has a
   *   confirmed delivery, and the new LMP differs from the matched case's LMP
   *   → surface the specific "is this a new pregnancy?" prompt (409 with a
   *   RE_ENROLLMENT reason in details) so the client can confirm and resubmit
   *   with acknowledgeDuplicate.
   * - FR-S-2.4 (new pregnancy): matched case has BOTH a delivery date AND a
   *   closure date → treat as a completed prior journey, allow the new
   *   enrollment (return normally).
   * - FR-S-2.4 (hard duplicate): anything else — including a matched case
   *   with no summary row at all (SRS-literal: "if both not present →
   *   duplicate, registration cannot proceed") → block with a 409.
   */
  private evaluateDuplicateMatch(match: DuplicateMatch, dto: CreateBeneficiaryInput): void {
    const summary = match.currentSummary;
    const hasDelivery = Boolean(summary?.dateOfDelivery);
    const hasClosure = Boolean(summary?.closureDate);
    const isCompletedJourney =
      match.currentStatus === 'JOURNEY_COMPLETE' || match.currentStatus === 'CLOSED';

    const newLmp = dto.motherDetails?.lmpDate;
    const priorLmp = summary?.lmpDate;
    const lmpDiffers =
      newLmp != null &&
      priorLmp != null &&
      newLmp.toISOString().slice(0, 10) !== priorLmp.toISOString().slice(0, 10);

    // FR-S-2.5 — re-enrolment for a new pregnancy after a completed journey.
    if (isCompletedJourney && hasDelivery && lmpDiffers) {
      throw new HttpError(
        409,
        'A previous record exists for this beneficiary. Is this a new pregnancy?',
        {
          reason: 'RE_ENROLLMENT',
          existingBeneficiaryId: match.id,
          resolution: 'Resubmit with acknowledgeDuplicate: true to enroll a new pregnancy.',
        },
      );
    }

    // FR-S-2.4 — both delivery AND closure exist → completed prior journey,
    // this is a legitimate new pregnancy; allow it through.
    if (hasDelivery && hasClosure) {
      return;
    }

    // FR-S-2.4 — otherwise a hard duplicate (including no summary row at all).
    throw conflict(
      `A possible duplicate beneficiary already exists (beneficiaryId: ${match.id}). ` +
        'Resubmit with acknowledgeDuplicate: true to proceed anyway.',
    );
  }
}

function computeBmi(heightCm: number | undefined, weightKg: number | undefined): number | null {
  if (!heightCm || !weightKg) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}
