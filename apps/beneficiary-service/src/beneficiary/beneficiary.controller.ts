import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { BeneficiaryService } from './beneficiary.service';
import {
  API_CONSENT_STATUSES,
  BENEFICIARY_STATUSES,
  CASE_PHASES,
  CASE_TYPES,
  SEXES,
  SUMMARY_PHASES,
} from './beneficiary.constants';
import { createBeneficiarySchema } from './dto/create-beneficiary.dto';
import { listBeneficiariesQuerySchema } from './dto/list-beneficiaries.dto';
import { upsertSocioDemographicsSchema } from './dto/upsert-socio-demographics.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  errorResponse,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const idParamsSchema = z.object({ id: z.string().uuid() }).strict();

const piiResponseSchema = z.object({
  id: z.string().uuid(),
  // Decrypted server-side for display (see BeneficiaryService.list/getById) —
  // never the raw fullNameEnc/fullNameSearchHash.
  fullName: z.string().openapi({ example: 'Jane Doe' }),
  // Decrypted server-side for display, same as fullName — never the raw
  // phoneEnc/addressLineEnc columns.
  mobileNumber: z.string().nullable().openapi({ example: '9876543210' }),
  address: z.string().nullable(),
  villageId: z.string().uuid().nullable(),
  padaId: z.string().uuid().nullable(),
  healthSubCentreId: z.string().uuid().nullable(),
  phcId: z.string().uuid().nullable(),
  healthBlockId: z.string().uuid().nullable(),
  dateOfBirth: z.string().datetime().nullable(),
  sex: z.enum(SEXES).nullable(),
  stateId: z.string().uuid().nullable(),
  districtId: z.string().uuid().nullable(),
  talukaId: z.string().uuid().nullable(),
});

const riskConditionSummarySchema = z.object({
  riskConditionId: z.string().uuid(),
  phase: z.enum(SUMMARY_PHASES),
  latestGrade: z.string().nullable(),
  latestAssessedAt: z.string().datetime().nullable(),
  everHighestGrade: z.string().nullable(),
  everAtRiskFlag: z.boolean(),
  currentReferralTriggerFlag: z.boolean(),
  currentHrVisitTriggerFlag: z.boolean(),
});

const statusHistoryEntrySchema = z.object({
  fromStatus: z.enum(BENEFICIARY_STATUSES).nullable(),
  toStatus: z.enum(BENEFICIARY_STATUSES),
  reasonCode: z.string().nullable(),
  changedByUserId: z.string().uuid(),
  changedAt: z.string().datetime(),
  notes: z.string().nullable(),
});

const motherCaseDetailsSchema = z.object({
  lmpDate: z.string().datetime(),
  eddDate: z.string().datetime(),
  gravida: z.number().int().nullable(),
  parity: z.number().int().nullable(),
  heightCm: z.number().nullable(),
  bmiAtRegistration: z.number().nullable(),
});

const childCaseDetailsSchema = z.object({
  motherBeneficiaryId: z.string().uuid().nullable(),
  dateOfBirth: z.string().datetime(),
  sex: z.enum(SEXES).nullable(),
  birthWeightKg: z.number().nullable(),
  birthLengthCm: z.number().nullable(),
  prematureFlag: z.boolean().nullable(),
  linkedAncCase: z.boolean(),
});

// A *LookupId field resolved against auth-service's lookup_values, for
// display without a second client round-trip to GET /lookups/:categoryCode.
const resolvedLookupValueSchema = z
  .object({
    categoryCode: z.string().openapi({ example: 'RELIGION' }),
    valueCode: z.string().openapi({ example: 'HINDU' }),
    label: z.string().openapi({ example: 'Hindu' }),
  })
  .nullable();

// Registration-time socio-demographic answers per SRS v3.0 / "Revised App
// Form Final (20 March 2026)" Registration_PW_D sheet, rows 23-34.
// *LookupId fields carry the plain scalar id (per the forklift rule, the
// underlying lookup_values row is owned by auth-service); each has a sibling
// resolved field (same name minus the "LookupId" suffix) carrying the
// category/value/label looked up server-side for display.
const socioDemographicsSchema = z.object({
  phoneOwnerLookupId: z.string().uuid().nullable(),
  phoneOwner: resolvedLookupValueSchema,
  mobileNetworkAvailabilityLookupId: z.string().uuid().nullable(),
  mobileNetworkAvailability: resolvedLookupValueSchema,
  educationLevelLookupId: z.string().uuid().nullable(),
  educationLevel: resolvedLookupValueSchema,
  partnerEducationLevelLookupId: z.string().uuid().nullable(),
  partnerEducationLevel: resolvedLookupValueSchema,
  partnerOccupationLookupId: z.string().uuid().nullable(),
  partnerOccupation: resolvedLookupValueSchema,
  yearsInVillage: z.number().int().nullable(),
  migrationPatternLookupId: z.string().uuid().nullable(),
  migrationPattern: resolvedLookupValueSchema,
  monthlyIncomeLookupId: z.string().uuid().nullable(),
  monthlyIncome: resolvedLookupValueSchema,
  religionLookupId: z.string().uuid().nullable(),
  religion: resolvedLookupValueSchema,
  socialCategoryLookupId: z.string().uuid().nullable(),
  socialCategory: resolvedLookupValueSchema,
  familyMembersCount: z.number().int().nullable(),
  childrenUnder5Count: z.number().int().nullable(),
});

const consentRecordSchema = z.object({
  consentType: z.string().openapi({ example: 'PROGRAM_ENROLLMENT' }),
  consentStatus: z.enum(API_CONSENT_STATUSES),
  consentDate: z.string().datetime(),
  capturedByUserId: z.string().uuid(),
});

// Fields mirror `model BeneficiaryCase` in prisma/schema.prisma — no invented
// fields — for accurate Swagger documentation only.
const beneficiaryCaseSchema = z.object({
  id: z.string().uuid(),
  localCaseUuid: z.string(),
  piiId: z.string().uuid(),
  projectId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  caseType: z.enum(CASE_TYPES),
  registrationDate: z.string().datetime(),
  previousBeneficiaryId: z.string().uuid().nullable(),
  motherBeneficiaryId: z.string().uuid().nullable(),
  beneficiaryTypeLookupId: z.string().uuid(),
  caseTypeLookupId: z.string().uuid(),
  journeyStartDate: z.string().datetime(),
  currentPhase: z.enum(CASE_PHASES),
  currentStatus: z.string().openapi({ example: 'ACTIVE' }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const beneficiaryCaseDetailSchema = beneficiaryCaseSchema.extend({
  pii: piiResponseSchema,
  motherCaseDetails: motherCaseDetailsSchema.nullable(),
  childCaseDetails: childCaseDetailsSchema.nullable(),
  consentRecords: z.array(consentRecordSchema),
  riskConditionSummaries: z.array(riskConditionSummarySchema),
  statusHistory: z.array(statusHistoryEntrySchema),
  socioDemographics: socioDemographicsSchema.nullable(),
});

// List rows carry PII (decrypted name) but not the full detail-view
// includes (risk/status history/mother-or-child details/consent) — per
// SRS FR-S-9.2 / HLD's filter table, the list only needs to support
// search/filter and a compact display row.
const beneficiaryListItemSchema = beneficiaryCaseSchema.extend({
  pii: piiResponseSchema,
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Beneficiary HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * `trustGatewayIdentity` populates `req.user` from the headers the API
 * Gateway set after verifying the caller's JWT (see the HLD §3.1 Step 2) —
 * this service does not re-verify the token itself, only checks the role.
 * Required roles per the HLD §4.1 endpoint table.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in
 * the same call as the Express route itself — the request body/params schema
 * and the gateway-auth requirement are inferred from `validateBody`/`validate`/
 * `trustGatewayIdentity` already in the middleware chain, so `/docs.json` can
 * never drift from what's actually mounted.
 */
export function createBeneficiaryRouter(service: BeneficiaryService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/beneficiaries',
    {
      summary: 'List beneficiary cases',
      tags: ['Beneficiaries'],
      responses: {
        200: {
          description: 'Beneficiary cases retrieved',
          schema: envelope(z.array(beneficiaryListItemSchema)),
        },
        400: errorResponse(400, { message: 'atRiskOnly: Expected boolean, received string' }),
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listBeneficiariesQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof listBeneficiariesQuerySchema>;
      res.json(ok(await service.list(query, req.user, authorizationHeader)));
    }),
  );

  doc.get(
    '/beneficiaries/:id',
    {
      summary: 'Get a beneficiary case by id — profile, current phase, risk state, status history',
      tags: ['Beneficiaries'],
      responses: {
        200: {
          description: 'Beneficiary case retrieved',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        400: errorResponse(400, { message: 'id: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(idParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getById(req.params.id, authorizationHeader)));
    }),
  );

  doc.post(
    '/beneficiaries',
    {
      summary: 'Enroll a new beneficiary (mother or child)',
      tags: ['Beneficiaries'],
      responses: {
        201: {
          description: 'Beneficiary case created',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        400: errorResponse(400, { message: 'pii.fullName: Required' }),
        401: errorResponse(401),
        403: errorResponse(403, {
          description: 'Forbidden — caller role not permitted (SAKHI only)',
        }),
        409: errorResponse(409, {
          message: 'A possible duplicate beneficiary already exists.',
          description: 'Conflict — a possible duplicate beneficiary already exists',
        }),
        422: errorResponse(422, {
          message: 'Consent must be given before registration can proceed.',
          description: 'Unprocessable — consent not received; registration cannot proceed',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createBeneficiarySchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.create(req.body, req.user.id, authorizationHeader);
      res.status(201).json(ok(created));
    }),
  );

  doc.patch(
    '/beneficiaries/:id/socio-demographics',
    {
      summary: "Upsert a beneficiary's registration socio-demographic answers",
      tags: ['Beneficiaries'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'Socio-demographics saved; the updated case is returned',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        400: errorResponse(400, { message: 'familyMembersCount: Number must be less than 15' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(idParamsSchema, 'params'),
    validateBody(upsertSocioDemographicsSchema),
    asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.upsertSocioDemographics(
        req.params.id,
        req.body,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  );

  return doc;
}
