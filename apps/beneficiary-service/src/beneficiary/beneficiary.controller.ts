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
import {
  listBeneficiariesQuerySchema,
  normalizeRegisteredDateAliases,
} from './dto/list-beneficiaries.dto';
import {
  summaryQuerySchema,
  normalizeRegisteredDateAliases as normalizeSummaryDateAliases,
} from './dto/summary-query.dto';
import { upsertSocioDemographicsSchema } from './dto/upsert-socio-demographics.dto';
import { upsertRiskConditionSummarySchema } from './dto/upsert-risk-condition-summary.dto';
import { applyLmpChangeSchema } from './dto/apply-lmp-change.dto';
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
  // Decrypted server-side for display, same as fullName/mobileNumber/address
  // — never the raw rchNumberEnc column. Null when the Sakhi left RCH
  // enrollment unanswered or had no card available (see
  // create-beneficiary.dto.ts's rchNumber note).
  rchNumber: z.string().nullable().openapi({ example: 'KA201900042' }),
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

// List rows carry PII (decrypted name) and mother-or-child details (EDD/LMP/
// BMI, or birthdate) — the Supervisor app's list UI needs these without a
// follow-up detail call — but not the full detail-view's consent/risk/status
// history, which only the single-case detail endpoint returns.
//
// sakhiName/projectName/villageName are resolved server-side from
// auth-service (see BeneficiaryService.list's enrichListPage) since
// beneficiary_cases/pii stores only the bare ids — the Supervisor
// monitoring / Manager listing UI needs display names without a per-row
// follow-up call. Nullable: a stale/deleted Sakhi, project, or village
// resolves to null rather than failing the whole list response.
const beneficiaryListItemSchema = beneficiaryCaseSchema.extend({
  pii: piiResponseSchema,
  motherCaseDetails: motherCaseDetailsSchema.nullable(),
  childCaseDetails: childCaseDetailsSchema.nullable(),
  sakhiName: z.string().nullable().openapi({ example: 'Priya Sharma' }),
  projectName: z.string().nullable().openapi({ example: 'GEP 2026-27' }),
  villageName: z.string().nullable().openapi({ example: 'Sample Village' }),
});

const beneficiaryListPageSchema = z.object({
  items: z.array(beneficiaryListItemSchema),
  nextCursor: z.string().nullable().openapi({
    description: 'Pass back as `cursor` to fetch the next page; null when this is the last page.',
  }),
});

const registrationSummarySchema = z.object({
  total: z.number().int(),
  motherCount: z.number().int(),
  childCount: z.number().int(),
});

const riskSummarySchema = z.object({
  total: z.number().int(),
  byGrade: z.record(z.string(), z.number().int()),
  everAtRiskCount: z.number().int(),
  referralTriggerCount: z.number().int(),
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
      summary:
        'List beneficiary cases. Filters: projectId, villageId, padaId, sakhiId, caseType, ' +
        'status, atRiskOnly, name, mobileNumber, fromDate/toDate (registrationDate range). ' +
        "Cursor-paginated via cursor/limit (default 50, max 100) — pass the response's " +
        'nextCursor back as `cursor` to fetch the next page. A SAKHI caller is always scoped ' +
        'to their own cases regardless of sakhiId; a SUPERVISOR is scoped to their own Sakhi ' +
        'roster and may narrow further to one sakhiId within it (403 if not in their roster); ' +
        'MANAGER/ADMIN are unscoped. Each row includes sakhiName/projectName/villageName, ' +
        'resolved server-side for display (null if the referenced Sakhi/project/village is ' +
        'stale or unresolvable).',
      tags: ['Beneficiaries'],
      responses: {
        200: {
          description: 'Beneficiary cases retrieved',
          schema: envelope(beneficiaryListPageSchema),
        },
        400: errorResponse(400, { message: 'atRiskOnly: Expected boolean, received string' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
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
      const query = normalizeRegisteredDateAliases(
        req.query as unknown as z.infer<typeof listBeneficiariesQuerySchema>,
      );
      res.json(ok(await service.list(query, req.user, authorizationHeader)));
    }),
  );

  doc.get(
    '/beneficiaries/registration-summary',
    {
      summary:
        'Registration Summary widget — total/mother/child counts of in-scope beneficiary ' +
        'cases. Same role-scoping (sakhiId) and registrationDate range (fromDate/toDate) as ' +
        'GET /beneficiaries, minus pagination/search.',
      tags: ['Beneficiaries'],
      responses: {
        200: { description: 'Registration counts', schema: envelope(registrationSummarySchema) },
        400: errorResponse(400, { message: 'fromDate must be on or before toDate.' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(summaryQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = normalizeSummaryDateAliases(
        req.query as unknown as z.infer<typeof summaryQuerySchema>,
      );
      res.json(ok(await service.getRegistrationSummary(query, req.user, authorizationHeader)));
    }),
  );

  doc.get(
    '/beneficiaries/risk-summary',
    {
      summary:
        "Risk Summary widget — counts of in-scope beneficiaries' risk condition summaries " +
        'grouped by latestGrade, plus everAtRiskCount/referralTriggerCount. Same role-scoping ' +
        '(sakhiId) and registrationDate range (fromDate/toDate) as GET /beneficiaries. Counts ' +
        'per condition (a beneficiary with 2 HIGH conditions contributes 2 to byGrade.HIGH), ' +
        'not collapsed to one grade per beneficiary.',
      tags: ['Beneficiaries'],
      responses: {
        200: { description: 'Risk grade counts', schema: envelope(riskSummarySchema) },
        400: errorResponse(400, { message: 'fromDate must be on or before toDate.' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(summaryQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = normalizeSummaryDateAliases(
        req.query as unknown as z.infer<typeof summaryQuerySchema>,
      );
      res.json(ok(await service.getRiskSummary(query, req.user, authorizationHeader)));
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
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getById(req.params.id, req.user, authorizationHeader)));
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

  doc.patch(
    '/beneficiaries/:id/lmp',
    {
      summary: 'Apply an approved LMP change (FR-SV-4.2) — server-to-server only',
      tags: ['Beneficiaries'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'LMP/EDD updated; the updated case is returned',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        400: errorResponse(400, { message: 'lmpDate: Required' }),
        401: errorResponse(401),
        403: errorResponse(403, {
          message: "This beneficiary case is outside this Supervisor's roster.",
        }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idParamsSchema, 'params'),
    validateBody(applyLmpChangeSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.applyLmpChange(
        req.params.id,
        req.body.lmpDate,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  );

  doc.patch(
    '/beneficiaries/:id/risk-condition-summary',
    {
      summary:
        "Upsert a beneficiary's per-condition risk rollup (Beneficiary_risk_condition_summary) " +
        "— gated by requireRoles('SAKHI') since this codebase has no machine/service-account " +
        "identity: the call chain originates from a SAKHI's form submission (visit-form-service " +
        "-> risk-referral-service -> here), forwarding the SAKHI's own token at each hop. Not the " +
        "source of truth — risk-referral-service's risk_assessments/risk_flags tables are; this " +
        'is a derived rollup updated after every applicable visit/risk evaluation.',
      tags: ['Beneficiaries'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'Risk condition summary upserted',
          schema: envelope(riskConditionSummarySchema),
        },
        400: errorResponse(400, { message: 'riskConditionId: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'This beneficiary case is outside your own roster.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(idParamsSchema, 'params'),
    validateBody(upsertRiskConditionSummarySchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.upsertRiskConditionSummary(
        req.params.id,
        req.body,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  );

  doc.patch(
    '/beneficiaries/:id/reactivate',
    {
      summary: 'Reactivate a CLOSED beneficiary case (FR-SV-4.7) — server-to-server only',
      tags: ['Beneficiaries'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'Case reactivated; the updated case is returned',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        401: errorResponse(401),
        403: errorResponse(403, {
          message: "This beneficiary case is outside this Supervisor's roster.",
        }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        409: errorResponse(409, { message: 'Cannot reactivate a case with status ACTIVE.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.reactivateCase(
        req.params.id,
        req.user.id,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  );

  return doc;
}
