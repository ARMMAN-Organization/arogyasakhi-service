import { addDays } from '@armman/core';
import {
  encryptPii,
  forbidden,
  hashForSearch,
  notFound,
  normalizeForSearch,
  unprocessable,
  type AuthenticatedUser,
} from '@armman/service-commons';
import type {
  BeneficiaryRiskConditionSummary,
  BeneficiaryStatusHistory,
} from '../../../../node_modules/.prisma/client-beneficiary-service';
import type { BeneficiaryStatus, CaseType } from './beneficiary.constants';
import { buildSearchTokens, evaluateDuplicateMatch } from './beneficiary.duplicate-detection';
import { computeBmi, withDecryptedName } from './beneficiary.mapper';
import type { BeneficiaryListFilters, BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';
import { resolveHealthBlockIdFromPhc } from '../geography/geography.client';
import { listSakhiIdsForSupervisor } from '../sakhi/sakhi.client';

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

/** Business logic for the beneficiary enrollment lifecycle. */
export class BeneficiaryService {
  constructor(private readonly repository: BeneficiaryRepository) {}

  /**
   * Lists beneficiary cases per SRS FR-S-9.2 / HLD's filter set, scoped by
   * the caller's role: a SAKHI only ever sees their own cases (their own id
   * always wins over anything else), a SUPERVISOR only sees cases belonging
   * to their own Sakhis (resolved via auth-service's existing
   * `/projects/:projectId/sakhis`, filtered by supervisorId — no new
   * auth-service endpoint), and MANAGER/ADMIN see everything unscoped. Each
   * row's name is decrypted server-side for display — the search hash
   * itself is never returned.
   */
  async list(
    query: ListBeneficiariesQuery,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
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

    if (caller.roles.includes('SAKHI')) {
      filters.sakhiId = caller.id;
    } else if (caller.roles.includes('SUPERVISOR')) {
      // Per the SRS, a Supervisor has exactly one project — a caller missing
      // this claim is an invalid/inconsistent identity, not a "no project"
      // case to silently degrade into a malformed `/projects//sakhis` path.
      if (!caller.projectId) {
        throw forbidden('Supervisor caller has no project scope.');
      }
      filters.sakhiIds = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
    }

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
   * `authorizationHeader` is the same caller's original bearer token,
   * forwarded unchanged to resolve pii.healthBlockId server-side from
   * pii.phcId (see geography.client.ts) — the mobile enrollment form has no
   * field to capture Health Block itself.
   */
  async create(dto: CreateBeneficiaryInput, capturedByUserId: string, authorizationHeader: string) {
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

    const fullName = dto.pii.fullName;
    const searchTokens = buildSearchTokens(dto, fullName);

    if (!dto.acknowledgeDuplicate) {
      const match = await this.repository.findDuplicateCandidate(searchTokens);
      if (match) {
        evaluateDuplicateMatch(match, dto);
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

    // Mobile never sends pii.healthBlockId (no field for it on the enrollment
    // form) — derive it server-side from pii.phcId's parent Health Block
    // instead of persisting null for every case.
    const healthBlockId = await resolveHealthBlockIdFromPhc(dto.pii.phcId, authorizationHeader);

    const created = await this.repository.createEnrollment({
      pii: {
        fullNameEnc: encryptPii(fullName),
        fullNameSearchHash: hashForSearch(normalizeForSearch(fullName)),
        phoneEnc: dto.pii.phone ? encryptPii(dto.pii.phone) : null,
        phoneSearchHash: dto.pii.phone ? hashForSearch(normalizeForSearch(dto.pii.phone)) : null,
        alternatePhoneEnc: dto.pii.alternatePhone ? encryptPii(dto.pii.alternatePhone) : null,
        villageId: dto.pii.villageId ?? null,
        padaId: dto.pii.padaId ?? null,
        healthSubCentreId: dto.pii.healthSubCentreId ?? null,
        phcId: dto.pii.phcId ?? null,
        healthBlockId,
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
}
