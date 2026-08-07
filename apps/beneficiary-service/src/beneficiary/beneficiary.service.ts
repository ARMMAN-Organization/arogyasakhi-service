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
import type { UpsertSocioDemographicsInput } from './dto/upsert-socio-demographics.dto';
import { resolveHealthBlockIdFromPhc } from '../geography/geography.client';
import { resolveLookupIdsByValueCode, resolveLookupValues } from '../lookups/lookup.client';
import { listSakhiIdsForSupervisor } from '../sakhi/sakhi.client';

/**
 * Maps each socioDemographics *LookupId field to the lookup_categories
 * category_code it reads from (see socioDemographicsSchema in
 * create-beneficiary.dto.ts for the category assignments). Both education
 * fields (self/partner) read the same EDUCATION_LEVEL category — the form
 * asks the same question twice, once per person.
 */
const SOCIO_DEMOGRAPHICS_LOOKUP_CATEGORIES: Record<string, string> = {
  phoneOwnerLookupId: 'PHONE_OWNER',
  mobileNetworkAvailabilityLookupId: 'MOBILE_NETWORK_AVAILABILITY',
  educationLevelLookupId: 'EDUCATION_LEVEL',
  partnerEducationLevelLookupId: 'EDUCATION_LEVEL',
  partnerOccupationLookupId: 'PARTNER_OCCUPATION',
  migrationPatternLookupId: 'MIGRATION_PATTERN',
  monthlyIncomeLookupId: 'MONTHLY_INCOME_BRACKET',
  religionLookupId: 'RELIGION',
  socialCategoryLookupId: 'SOCIAL_CATEGORY',
};

/**
 * Strips the "LookupId" suffix and resolves each socioDemographics field to
 * its human-readable {categoryCode, valueCode, label} — e.g.
 * religionLookupId -> a sibling `religion` key. Non-lookup fields
 * (yearsInVillage, familyMembersCount, childrenUnder5Count) are left as-is.
 * A missing/unresolvable value (or no socioDemographics row at all) never
 * fails the whole response — the case/PII/other detail is still valid data.
 */
async function withResolvedSocioDemographics<T extends Record<string, unknown>>(
  caseDetail: T,
  authorizationHeader: string,
): Promise<T> {
  const socio = caseDetail.socioDemographics as Record<string, unknown> | null | undefined;
  if (!socio) return caseDetail;

  const requests: Record<string, { categoryCode: string; lookupValueId: string | null }> = {};
  for (const [field, categoryCode] of Object.entries(SOCIO_DEMOGRAPHICS_LOOKUP_CATEGORIES)) {
    requests[field] = { categoryCode, lookupValueId: (socio[field] as string | null) ?? null };
  }

  const resolved = await resolveLookupValues(requests, authorizationHeader);

  const withResolved = { ...socio };
  for (const field of Object.keys(SOCIO_DEMOGRAPHICS_LOOKUP_CATEGORIES)) {
    const resolvedKey = field.replace(/LookupId$/, '');
    withResolved[resolvedKey] = resolved[field];
  }

  return { ...caseDetail, socioDemographics: withResolved };
}

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

  async getById(id: string, authorizationHeader: string) {
    const found = await this.repository.findById(id);
    if (!found) throw notFound('Beneficiary case not found.');
    const projected = withDecryptedName(found);
    return withResolvedSocioDemographics(projected, authorizationHeader);
  }

  /**
   * Upserts the socio-demographic answers for an existing beneficiary, taking
   * the registration form's own `value_code` strings and resolving them to
   * lookup_values ids here (see resolveLookupIdsByValueCode) — the caller is
   * visit-form-service forwarding a MOTHER_REGISTRATION submission, and a form
   * answer is a value_code, not an id.
   *
   * An unrecognised value_code resolves to null rather than failing: one
   * unmatched dropdown answer must not reject a whole registration's worth of
   * socio-demographic data.
   */
  async upsertSocioDemographics(
    beneficiaryId: string,
    dto: UpsertSocioDemographicsInput,
    authorizationHeader: string,
  ) {
    const found = await this.repository.findById(beneficiaryId);
    if (!found) throw notFound('Beneficiary case not found.');

    // field name on this DTO -> the *LookupId column it populates.
    const lookupFields: Record<string, { column: string; categoryCode: string }> = {
      phoneOwner: { column: 'phoneOwnerLookupId', categoryCode: 'PHONE_OWNER' },
      mobileNetworkAvailability: {
        column: 'mobileNetworkAvailabilityLookupId',
        categoryCode: 'MOBILE_NETWORK_AVAILABILITY',
      },
      educationLevel: { column: 'educationLevelLookupId', categoryCode: 'EDUCATION_LEVEL' },
      partnerEducationLevel: {
        column: 'partnerEducationLevelLookupId',
        categoryCode: 'EDUCATION_LEVEL',
      },
      partnerOccupation: {
        column: 'partnerOccupationLookupId',
        categoryCode: 'PARTNER_OCCUPATION',
      },
      migrationPattern: { column: 'migrationPatternLookupId', categoryCode: 'MIGRATION_PATTERN' },
      monthlyIncome: { column: 'monthlyIncomeLookupId', categoryCode: 'MONTHLY_INCOME_BRACKET' },
      religion: { column: 'religionLookupId', categoryCode: 'RELIGION' },
      socialCategory: { column: 'socialCategoryLookupId', categoryCode: 'SOCIAL_CATEGORY' },
    };

    const requests: Record<string, { categoryCode: string; valueCode: string | null }> = {};
    for (const [dtoField, { categoryCode }] of Object.entries(lookupFields)) {
      const supplied = dto[dtoField as keyof UpsertSocioDemographicsInput];
      if (typeof supplied === 'string') {
        requests[dtoField] = { categoryCode, valueCode: supplied };
      }
    }

    const resolvedIds = Object.keys(requests).length
      ? await resolveLookupIdsByValueCode(requests, authorizationHeader)
      : {};

    // Only write what the caller actually supplied — see the repository's
    // upsert doc comment on why an absent key must not null the column.
    const data: Record<string, unknown> = {};
    for (const [dtoField, { column }] of Object.entries(lookupFields)) {
      if (dtoField in requests) data[column] = resolvedIds[dtoField] ?? null;
    }
    if (dto.yearsInVillage !== undefined) data.yearsInVillage = dto.yearsInVillage;
    if (dto.familyMembersCount !== undefined) data.familyMembersCount = dto.familyMembersCount;
    if (dto.childrenUnder5Count !== undefined) data.childrenUnder5Count = dto.childrenUnder5Count;

    await this.repository.upsertSocioDemographics(beneficiaryId, data);
    return this.getById(beneficiaryId, authorizationHeader);
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
    if (existing)
      return withResolvedSocioDemographics(withDecryptedName(existing), authorizationHeader);

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

    const socioDemographics = dto.socioDemographics
      ? {
          phoneOwnerLookupId: dto.socioDemographics.phoneOwnerLookupId ?? null,
          mobileNetworkAvailabilityLookupId:
            dto.socioDemographics.mobileNetworkAvailabilityLookupId ?? null,
          educationLevelLookupId: dto.socioDemographics.educationLevelLookupId ?? null,
          partnerEducationLevelLookupId:
            dto.socioDemographics.partnerEducationLevelLookupId ?? null,
          partnerOccupationLookupId: dto.socioDemographics.partnerOccupationLookupId ?? null,
          yearsInVillage: dto.socioDemographics.yearsInVillage ?? null,
          migrationPatternLookupId: dto.socioDemographics.migrationPatternLookupId ?? null,
          monthlyIncomeLookupId: dto.socioDemographics.monthlyIncomeLookupId ?? null,
          religionLookupId: dto.socioDemographics.religionLookupId ?? null,
          socialCategoryLookupId: dto.socioDemographics.socialCategoryLookupId ?? null,
          familyMembersCount: dto.socioDemographics.familyMembersCount ?? null,
          childrenUnder5Count: dto.socioDemographics.childrenUnder5Count ?? null,
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
        // Always the authenticated caller's own id — dto.case.sakhiId is
        // ignored even if present, so a Sakhi can never enroll a beneficiary
        // under another Sakhi's name (see caseSchema.sakhiId).
        sakhiId: capturedByUserId,
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
      socioDemographics,
      searchTokens,
      consentDate: dto.consent.date,
      consentCapturedByUserId: capturedByUserId,
    });

    const projected = {
      ...withDecryptedName(created),
      // Nothing has accrued yet for a case created in this same call — risk
      // evaluation and status transitions only happen after visits/status
      // changes (see the repository's comment on the create query).
      riskConditionSummaries: [] as BeneficiaryRiskConditionSummary[],
      statusHistory: [] as BeneficiaryStatusHistory[],
    };
    return withResolvedSocioDemographics(projected, authorizationHeader);
  }
}
