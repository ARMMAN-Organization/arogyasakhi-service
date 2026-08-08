import { decryptPii } from '@armman/service-commons';

/** Encrypted-name-bearing PII row as read from Prisma (only the fields the
 * projector needs are declared). */
export interface PiiRow {
  id: string;
  fullNameEnc: Buffer;
  phoneEnc: Buffer | null;
  addressLineEnc: Buffer | null;
  rchNumberEnc: Buffer | null;
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
 * beneficiary.controller.ts), decrypting `pii.fullName`/`pii.mobileNumber`/
 * `pii.address` for display. Every level is allow-listed — the case, `pii`,
 * and each nested relation — so internal columns
 * (createdByUserId/updatedByUserId/isDeleted/deletedAt, encrypted/hash PII
 * columns, undocumented case fields like pregnancySequenceNo/journeyEndDate,
 * and nested audit columns) can never leak into a response even as the
 * Prisma rows gain columns.
 *
 * Nested relations are only projected when present, so this serves both the
 * list rows (case + pii only) and the detail view (case + pii + mother/child
 * details + consent + risk/status + socioDemographics).
 */
export function withDecryptedName<T extends { pii: PiiRow; [k: string]: unknown }>(caseRow: T) {
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
      mobileNumber: pii.phoneEnc ? decryptPii(pii.phoneEnc) : null,
      address: pii.addressLineEnc ? decryptPii(pii.addressLineEnc) : null,
      rchNumber: pii.rchNumberEnc ? decryptPii(pii.rchNumberEnc) : null,
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
  const socioDemographics = c.socioDemographics as Record<string, unknown> | null | undefined;
  if (socioDemographics !== undefined) {
    projected.socioDemographics = socioDemographics
      ? {
          phoneOwnerLookupId: socioDemographics.phoneOwnerLookupId,
          mobileNetworkAvailabilityLookupId: socioDemographics.mobileNetworkAvailabilityLookupId,
          educationLevelLookupId: socioDemographics.educationLevelLookupId,
          partnerEducationLevelLookupId: socioDemographics.partnerEducationLevelLookupId,
          partnerOccupationLookupId: socioDemographics.partnerOccupationLookupId,
          yearsInVillage: socioDemographics.yearsInVillage,
          migrationPatternLookupId: socioDemographics.migrationPatternLookupId,
          monthlyIncomeLookupId: socioDemographics.monthlyIncomeLookupId,
          religionLookupId: socioDemographics.religionLookupId,
          socialCategoryLookupId: socioDemographics.socialCategoryLookupId,
          familyMembersCount: socioDemographics.familyMembersCount,
          childrenUnder5Count: socioDemographics.childrenUnder5Count,
        }
      : null;
  }

  return projected;
}

/** BMI from height (cm) and weight (kg), rounded to 2 dp; null if either is missing. */
export function computeBmi(
  heightCm: number | undefined,
  weightKg: number | undefined,
): number | null {
  if (!heightCm || !weightKg) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}
