import { z } from 'zod';
import {
  API_CONSENT_STATUSES,
  CASE_TYPES,
  CHILD_SEXES,
  MOTHER_SEXES,
} from '../beneficiary.constants';

/**
 * Validation schema for enrolling a beneficiary (mother or child), per SRS
 * FR-S-2.1/2.3/2.4/2.5. `.strict()` rejects unknown fields, matching the
 * previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
const piiSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(20).optional(),
    alternatePhone: z.string().trim().min(1).max(20).optional(),
    dateOfBirth: z.coerce.date().optional(),
    sex: z.enum(MOTHER_SEXES).optional(),
    addressLine: z.string().trim().min(1).max(500).optional(),
    villageId: z.string().uuid().optional(),
    padaId: z.string().uuid().optional(),
    healthSubCentreId: z.string().uuid().optional(),
    phcId: z.string().uuid().optional(),
    healthBlockId: z.string().uuid().optional(),
    stateId: z.string().uuid().optional(),
    districtId: z.string().uuid().optional(),
    talukaId: z.string().uuid().optional(),
    rchNumber: z.string().trim().min(1).max(50).optional(),
  })
  .strict();

/**
 * Cross-field consistency rules per SRS Category 3 (line 401): Para ≤
 * Gravida; Abortions ≤ Gravida; Dead children ≤ Live births; Live births +
 * Stillbirths + Abortions = Gravida (including the current pregnancy).
 */
const motherDetailsSchema = z
  .object({
    lmpDate: z.coerce.date(),
    gravida: z.number().int().min(0).max(14).optional(),
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
      if (sum !== gravida) {
        ctx.addIssue({
          code: 'custom',
          path: ['gravida'],
          message: 'liveBirths + stillbirths + abortions must equal gravida',
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
    sex: z.enum(CHILD_SEXES).optional(),
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

const caseSchema = z
  .object({
    // Client-generated at enrollment-form submission time — lets a
    // dropped-connection retry of POST /beneficiaries return the original
    // case instead of creating a duplicate, matching localSubmissionUuid/
    // localVisitUuid elsewhere in this codebase.
    localCaseUuid: z.string().trim().min(1).max(80),
    projectId: z.string().uuid(),
    sakhiId: z.string().uuid(),
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
