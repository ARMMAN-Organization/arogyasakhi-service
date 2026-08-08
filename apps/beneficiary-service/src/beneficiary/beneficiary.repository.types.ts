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
  /** Role-based scoping: a SAKHI caller only ever sees their own cases. */
  sakhiId?: string;
  /**
   * Role-based scoping: a SUPERVISOR caller only sees cases belonging to
   * their own Sakhis. An empty array must return no rows — it is a
   * default-deny result (supervisor has no Sakhis), never "no filter".
   */
  sakhiIds?: string[];
  /** Registration date range, inclusive on both ends. */
  fromDate?: string;
  toDate?: string;
  /** Opaque cursor from a prior page's `nextCursor` — see findMany's doc comment. */
  cursor?: string;
  limit: number;
}

export interface BeneficiaryListPage<T> {
  items: T[];
  nextCursor: string | null;
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

export interface SocioDemographicsCreateData {
  phoneOwnerLookupId: string | null;
  mobileNetworkAvailabilityLookupId: string | null;
  educationLevelLookupId: string | null;
  partnerEducationLevelLookupId: string | null;
  partnerOccupationLookupId: string | null;
  yearsInVillage: number | null;
  migrationPatternLookupId: string | null;
  monthlyIncomeLookupId: string | null;
  religionLookupId: string | null;
  socialCategoryLookupId: string | null;
  familyMembersCount: number | null;
  childrenUnder5Count: number | null;
}

export interface CreateEnrollmentInput {
  pii: PiiCreateData;
  case: CaseCreateData;
  motherDetails: MotherDetailsCreateData | null;
  childDetails: ChildDetailsCreateData | null;
  socioDemographics: SocioDemographicsCreateData | null;
  searchTokens: DuplicateSearchTokens;
  consentDate: Date;
  consentCapturedByUserId: string;
}
