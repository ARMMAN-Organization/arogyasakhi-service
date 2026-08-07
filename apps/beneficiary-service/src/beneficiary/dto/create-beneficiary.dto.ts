import { z } from 'zod';
import { API_CONSENT_STATUSES, CASE_TYPES, SEXES } from '../beneficiary.constants';

/**
 * Validation schema for enrolling a beneficiary (mother or child), per SRS
 * FR-S-2.1/2.3/2.4/2.5. `.strict()` rejects unknown fields, matching the
 * previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
const piiSchema = z
  .object({
    // Matches the MOTHER_REGISTRATION form's single beneficiary_name
    // question_code — the mobile form collects one combined name field, so
    // the client sends it as-is for the encrypted-storage/duplicate-detection
    // path (see fullNameEnc/fullNameSearchHash in beneficiary.service.ts).
    fullName: z.string().trim().min(1).max(200),
    // Required per SRS FR-S-2.1: "age, demographics, geographic details
    // (state, district, block, PHC, sub-centre, village, pada), mobile
    // numbers, RCH number." phone (mobile), dateOfBirth (age), and the 7
    // geography levels are therefore required. alternatePhone, addressLine,
    // sex, and talukaId (a govt-revenue unit distinct from the health
    // "block") are not named in the required list — left optional. rchNumber
    // is also optional here: the form's "Enrolled in RCH?" question allows
    // "not registered" / "card not available" / "status not known" (App
    // Form doc row 39-40), and in those cases the Sakhi has no number to
    // enter — only mandatory client-side when "RCH card available" is
    // selected, which this API doesn't model as a separate status field.
    phone: z.string().trim().min(1).max(20),
    alternatePhone: z.string().trim().min(1).max(20).optional(),
    dateOfBirth: z.coerce.date(),
    sex: z.enum(SEXES).optional(),
    addressLine: z.string().trim().min(1).max(500).optional(),
    villageId: z.string().uuid(),
    padaId: z.string().uuid(),
    healthSubCentreId: z.string().uuid(),
    phcId: z.string().uuid(),
    // Optional, not required: the mobile enrollment form has no field to
    // capture this and always omitted it, so the server derives the real
    // value from phcId's parent Health Block instead (see
    // beneficiary.service.ts). Kept as an accepted-but-ignored optional
    // field — not deleted from the schema — so a client still sending it
    // during the transition isn't rejected by this schema's .strict().
    healthBlockId: z.string().uuid().optional(),
    stateId: z.string().uuid(),
    districtId: z.string().uuid(),
    talukaId: z.string().uuid().optional(),
    rchNumber: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

/**
 * Cross-field consistency rules per SRS Category 3 (line 401): Para ≤
 * Gravida; Para = Live births + Stillbirths; Abortions ≤ Gravida; Dead
 * children ≤ Live births; Live births + Stillbirths + Abortions = Gravida - 1
 * (the sum covers only pregnancies that have already ended — the current
 * pregnancy, counted in Gravida, has no outcome yet, so subtracting 1
 * excludes it).
 */
const motherDetailsSchema = z
  .object({
    lmpDate: z.coerce.date(),
    // min(1), not min(0) — this is a MOTHER_REGISTRATION case (a currently
    // pregnant woman), and Gravida counts the current pregnancy by
    // definition, so 0 is never a legitimate value here. Also closes a real
    // bug the min(0) allowed: with the sum == gravida - 1 rule above,
    // gravida: 0 makes gravida - 1 evaluate to -1, which
    // liveBirths+stillbirths+abortions (each itself min(0)) can never reach —
    // every submission with gravida: 0 would fail the cross-check
    // unconditionally, with no way to satisfy it.
    gravida: z.number().int().min(1).max(14).optional(),
    parity: z.number().int().min(0).max(14).optional(),
    liveBirths: z.number().int().min(0).max(14).optional(),
    stillbirths: z.number().int().min(0).max(14).optional(),
    abortions: z.number().int().min(0).max(14).optional(),
    deadChildren: z.number().int().min(0).max(14).optional(),
    heightCm: z.number().positive().max(300).optional(),
    weightKg: z.number().positive().max(400).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.lmpDate > new Date()) {
      ctx.addIssue({
        code: 'custom',
        path: ['lmpDate'],
        message: 'lmpDate cannot be in the future',
      });
    }

    const { gravida, parity, abortions, deadChildren, liveBirths, stillbirths } = data;
    if (gravida === undefined) return;

    if (parity !== undefined && parity > gravida) {
      ctx.addIssue({
        code: 'custom',
        path: ['parity'],
        message: 'parity must be less than or equal to gravida',
      });
    }
    if (
      parity !== undefined &&
      liveBirths !== undefined &&
      stillbirths !== undefined &&
      parity !== liveBirths + stillbirths
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['parity'],
        message: 'parity must equal liveBirths + stillbirths',
      });
    }
    if (abortions !== undefined && abortions > gravida) {
      ctx.addIssue({
        code: 'custom',
        path: ['abortions'],
        message: 'abortions must be less than or equal to gravida',
      });
    }
    if (deadChildren !== undefined && liveBirths !== undefined && deadChildren > liveBirths) {
      ctx.addIssue({
        code: 'custom',
        path: ['deadChildren'],
        message: 'deadChildren must be less than or equal to liveBirths',
      });
    }
    if (liveBirths !== undefined && stillbirths !== undefined && abortions !== undefined) {
      const sum = liveBirths + stillbirths + abortions;
      if (sum !== gravida - 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['gravida'],
          message: 'liveBirths + stillbirths + abortions must equal gravida - 1',
        });
      }
    }
  });

/**
 * Child eligibility window per FR-S-2.3. The upper bound depends on whether
 * this registration is linked to an enrolled mother's journey (0-6 months /
 * 0-183 days) or independent (0-12 months / 0-365 days) — that depends on
 * `case.motherBeneficiaryId`, a sibling field this schema can't see, so only
 * the future-date check and a same-object-scoped placeholder run here; the
 * mother-linked-vs-independent day-count check runs in the top-level
 * `createBeneficiarySchema.superRefine` below, where both fields are visible.
 */
const childDetailsSchema = z
  .object({
    dateOfBirth: z.coerce.date(),
    sex: z.enum(SEXES).optional(),
    birthWeightKg: z.number().positive().max(10).optional(),
    birthLengthCm: z.number().positive().max(100).optional(),
    prematureFlag: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.dateOfBirth > new Date()) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateOfBirth'],
        message: 'dateOfBirth cannot be in the future',
      });
    }
  });

/** FR-S-2.3 upper bound, in days, on a child's age at registration. */
const CHILD_AGE_CEILING_DAYS = {
  /** Registered through an enrolled mother's ANC journey: 0-6 months. */
  MOTHER_LINKED: 183,
  /** Registered independently (mother was not ANC-enrolled): 0-12 months. */
  INDEPENDENT: 365,
} as const;

const consentSchema = z
  .object({
    status: z.enum(API_CONSENT_STATUSES),
    date: z.coerce.date(),
  })
  .strict();

/**
 * Registration-time socio-demographic answers — SRS v3.0 / "Revised App Form
 * Final (20 March 2026)" Registration_PW_D sheet, rows 23-34. Persisted 1:1
 * with the beneficiary case (see BeneficiarySocioDemographics in
 * schema.prisma) — dropdown/count answers, not person-identifying data, so
 * they live outside piiSchema and don't need encryption. All fields optional
 * at this layer: none of them gate registration itself (the ERD/DB columns
 * are nullable), matching how motherDetails'/childDetails' own optional
 * fields are handled.
 */
const socioDemographicsSchema = z
  .object({
    // lookup_values.lookup_value_id (category PHONE_OWNER) — owned by auth-service.
    phoneOwnerLookupId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category MOBILE_NETWORK_AVAILABILITY) — owned by auth-service.
    mobileNetworkAvailabilityLookupId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category EDUCATION_LEVEL) — owned by auth-service.
    educationLevelLookupId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category EDUCATION_LEVEL) — owned by auth-service.
    partnerEducationLevelLookupId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category PARTNER_OCCUPATION) — owned by auth-service.
    partnerOccupationLookupId: z.string().uuid().optional(),
    yearsInVillage: z.number().int().min(0).max(120).optional(),
    // lookup_values.lookup_value_id (category MIGRATION_PATTERN) — owned by auth-service.
    migrationPatternLookupId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category MONTHLY_INCOME_BRACKET) — owned by auth-service.
    monthlyIncomeLookupId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category RELIGION) — owned by auth-service.
    religionLookupId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category SOCIAL_CATEGORY) — owned by auth-service.
    socialCategoryLookupId: z.string().uuid().optional(),
    // Doc row 33: "Range 2 to 15."
    familyMembersCount: z.number().int().min(2).max(15).optional(),
    // Doc row 34: "1 digit."
    childrenUnder5Count: z.number().int().min(0).max(9).optional(),
  })
  .strict();

const caseSchema = z
  .object({
    // Client-generated at enrollment-form submission time — lets a
    // dropped-connection retry of POST /beneficiaries return the original
    // case instead of creating a duplicate, matching localSubmissionUuid/
    // localVisitUuid elsewhere in this codebase.
    localCaseUuid: z.string().trim().min(1).max(80),
    projectId: z.string().uuid(),
    // Accepted for backward compatibility with existing clients but never
    // trusted — the case is always attributed to the authenticated caller's
    // own id (see BeneficiaryService.create's capturedByUserId), never a
    // client-supplied value. A client can't create a beneficiary under
    // another Sakhi's name.
    sakhiId: z.string().uuid().optional(),
    caseType: z.enum(CASE_TYPES),
    registrationDate: z.coerce.date(),
    previousBeneficiaryId: z.string().uuid().optional(),
    motherBeneficiaryId: z.string().uuid().optional(),
    beneficiaryTypeLookupId: z.string().uuid(),
    caseTypeLookupId: z.string().uuid(),
  })
  .strict();

export const createBeneficiarySchema = z
  .object({
    pii: piiSchema,
    case: caseSchema,
    motherDetails: motherDetailsSchema.optional(),
    childDetails: childDetailsSchema.optional(),
    socioDemographics: socioDemographicsSchema.optional(),
    consent: consentSchema,
    /** Per FR-S-2.4: proceed despite a detected duplicate after the Sakhi acknowledges the warning. */
    acknowledgeDuplicate: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.case.caseType === 'MOTHER') {
      if (!data.motherDetails) {
        ctx.addIssue({
          code: 'custom',
          path: ['motherDetails'],
          message: 'motherDetails is required when caseType is MOTHER',
        });
      }
      if (data.childDetails) {
        ctx.addIssue({
          code: 'custom',
          path: ['childDetails'],
          message: 'childDetails must not be set when caseType is MOTHER',
        });
      }
    }
    if (data.case.caseType === 'CHILD') {
      if (!data.childDetails) {
        ctx.addIssue({
          code: 'custom',
          path: ['childDetails'],
          message: 'childDetails is required when caseType is CHILD',
        });
      }
      if (data.motherDetails) {
        ctx.addIssue({
          code: 'custom',
          path: ['motherDetails'],
          message: 'motherDetails must not be set when caseType is CHILD',
        });
      }

      // pii.dateOfBirth and childDetails.dateOfBirth are both required and
      // both describe the child's DOB for a CHILD case. Reject a mismatch so
      // the two tables can't persist conflicting dates — downstream code
      // (e.g. buildSearchTokens) treats them as the same value. Compared on
      // the calendar day (YYYY-MM-DD), matching beneficiary.duplicate-detection.ts,
      // so a same-date pair with differing time-of-day components (e.g. from a
      // date-only picker vs. a full ISO timestamp) doesn't spuriously fail.
      if (
        data.childDetails &&
        data.pii.dateOfBirth.toISOString().slice(0, 10) !==
          data.childDetails.dateOfBirth.toISOString().slice(0, 10)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['childDetails', 'dateOfBirth'],
          message: 'childDetails.dateOfBirth must match pii.dateOfBirth for a CHILD case',
        });
      }

      // FR-S-2.3: mother-linked registrations get the tighter 0-183-day
      // window; independent registrations get 0-365. Skipped if dateOfBirth
      // is already flagged as future-dated by childDetailsSchema above, to
      // avoid a redundant second issue on the same field.
      if (data.childDetails && data.childDetails.dateOfBirth <= new Date()) {
        const ageDays = Math.floor(
          (Date.now() - data.childDetails.dateOfBirth.getTime()) / (24 * 60 * 60 * 1000),
        );
        const ceiling = data.case.motherBeneficiaryId
          ? CHILD_AGE_CEILING_DAYS.MOTHER_LINKED
          : CHILD_AGE_CEILING_DAYS.INDEPENDENT;
        if (ageDays > ceiling) {
          ctx.addIssue({
            code: 'custom',
            path: ['childDetails', 'dateOfBirth'],
            message: data.case.motherBeneficiaryId
              ? 'child linked to an enrolled mother must be registered within 0-6 months (0-183 days) of birth'
              : 'child is outside the 0-12 month (0-365 day) independent enrollment eligibility window',
          });
        }
      }
    }
  });

export type CreateBeneficiaryInput = z.infer<typeof createBeneficiarySchema>;
