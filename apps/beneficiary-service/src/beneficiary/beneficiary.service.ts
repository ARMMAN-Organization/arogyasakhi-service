import { addDays } from '@armman/core';
import {
  conflict,
  encryptPii,
  hashForSearch,
  notFound,
  normalizeForSearch,
  unprocessable,
} from '@armman/service-commons';
import type { BeneficiaryRepository, DuplicateSearchTokens } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';

const GESTATION_DAYS = 280;

/** Business logic for the beneficiary enrollment lifecycle. */
export class BeneficiaryService {
  constructor(private readonly repository: BeneficiaryRepository) {}

  /** Lists recent beneficiary cases (scope enforcement added with the auth layer). */
  list() {
    return this.repository.findMany();
  }

  async getById(id: string) {
    const found = await this.repository.findById(id);
    if (!found) throw notFound('Beneficiary case not found.');
    return found;
  }

  /**
   * Enrolls a mother or child beneficiary per SRS FR-S-2.1/2.3/2.4/2.5.
   * `capturedByUserId` is the authenticated caller (Sakhi) recording consent.
   */
  async create(dto: CreateBeneficiaryInput, capturedByUserId: string) {
    if (dto.consent.status === 'REFUSED') {
      // Per SRS: "No" halts registration entirely — nothing is persisted.
      throw unprocessable('Consent not received. Registration cannot proceed.');
    }

    const searchTokens = this.buildSearchTokens(dto);

    if (!dto.acknowledgeDuplicate) {
      const duplicate = await this.repository.findDuplicateCandidate(searchTokens);
      if (duplicate) {
        throw conflict(
          `A possible duplicate beneficiary already exists (beneficiaryId: ${duplicate.beneficiaryId}). ` +
            'Resubmit with acknowledgeDuplicate: true to proceed anyway.',
        );
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

    return this.repository.createEnrollment({
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
        addressLineEnc: dto.pii.addressLine ? dto.pii.addressLine : null,
        stateId: dto.pii.stateId ?? null,
        districtId: dto.pii.districtId ?? null,
        talukaId: dto.pii.talukaId ?? null,
        rchNumberEnc: dto.pii.rchNumber ? encryptPii(dto.pii.rchNumber) : null,
        rchNumberHash: dto.pii.rchNumber
          ? hashForSearch(normalizeForSearch(dto.pii.rchNumber))
          : null,
      },
      case: {
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
  }

  private buildSearchTokens(dto: CreateBeneficiaryInput): DuplicateSearchTokens {
    const geographyParts = [dto.pii.villageId, dto.pii.padaId].filter(Boolean).join('|');
    const dob = dto.case.caseType === 'CHILD' ? dto.childDetails?.dateOfBirth : dto.pii.dateOfBirth;

    return {
      nameToken: hashForSearch(normalizeForSearch(dto.pii.fullName)),
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
}

function computeBmi(heightCm: number | undefined, weightKg: number | undefined): number | null {
  if (!heightCm || !weightKg) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}
