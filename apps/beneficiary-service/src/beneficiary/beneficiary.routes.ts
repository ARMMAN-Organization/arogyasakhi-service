import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { BeneficiaryService } from './beneficiary.service';
import { createBeneficiaryController } from './beneficiary.controller';
import {
  API_CONSENT_STATUSES,
  BENEFICIARY_STATUSES,
  CASE_PHASES,
  CASE_TYPES,
  CCV_OPENING_RISK_STATES,
  CHILD_CASE_PHASES,
  SEXES,
  SUMMARY_PHASES,
} from './beneficiary.constants';
import { createBeneficiarySchema } from './dto/create-beneficiary.dto';
import { listBeneficiariesQuerySchema } from './dto/list-beneficiaries.dto';
import { summaryQuerySchema } from './dto/summary-query.dto';
import { idsQuerySchema } from './dto/ids-query.dto';
import { byIdsWithRiskQuerySchema } from './dto/by-ids-with-risk-query.dto';
import { upsertSocioDemographicsSchema } from './dto/upsert-socio-demographics.dto';
import { upsertRiskConditionSummarySchema } from './dto/upsert-risk-condition-summary.dto';
import { applyLmpChangeSchema } from './dto/apply-lmp-change.dto';
import { updatePhaseSchema } from './dto/update-phase.dto';
import { setCcvOpeningRiskStateSchema } from './dto/set-ccv-opening-risk-state.dto';
import { applyClosureSchema } from './dto/apply-closure.dto';
import {
  errorResponse,
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
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
  // Resolved server-side from risk-referral-service's risk_conditions (owned
  // by that service — no cross-service joins, per the forklift rule). Null
  // when the id doesn't resolve to an ACTIVE condition, or when
  // risk-referral-service is unreachable — see
  // BeneficiaryService.withResolvedRiskConditionNames.
  conditionCode: z.string().nullable().openapi({ example: 'HYPERTENSION_HIGH_BP' }),
  conditionName: z.string().nullable().openapi({ example: 'Hypertension / High BP' }),
  gradeScale: z
    .enum(['BINARY', 'NORMAL_MILD_MODERATE_SEVERE', 'NORMAL_LOW_MEDIUM_HIGH'])
    .nullable(),
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
  currentPhase: z.enum(CHILD_CASE_PHASES),
  ccvOpeningRiskState: z.enum(CCV_OPENING_RISK_STATES).nullable(),
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

// Resolved server-side from visit-form-service's most recent visit-linked
// clinical submission (owned by that service — no cross-service joins per
// the forklift rule). Every field is null when the beneficiary has never
// had a qualifying visit, or when visit-form-service is unreachable — see
// BeneficiaryService.getById's own comment on the degrade-not-fail stance.
const lastVisitVitalsSchema = z
  .object({
    visitId: z.string().uuid().nullable(),
    submittedAt: z.string().datetime().nullable(),
    weightKg: z.number().nullable(),
    systolicBp: z.number().nullable(),
    diastolicBp: z.number().nullable(),
    temperatureF: z.number().nullable(),
    hemoglobinGDl: z.number().nullable(),
    muacCm: z.number().nullable(),
    respiratoryRate: z.number().nullable(),
  })
  .nullable();

const beneficiaryCaseDetailSchema = beneficiaryCaseSchema.extend({
  pii: piiResponseSchema,
  motherCaseDetails: motherCaseDetailsSchema.nullable(),
  childCaseDetails: childCaseDetailsSchema.nullable(),
  consentRecords: z.array(consentRecordSchema),
  riskConditionSummaries: z.array(riskConditionSummarySchema),
  // Worst (highest-severity) grade among riskConditionSummaries, collapsed to
  // the same 4-bucket vocabulary GET /beneficiaries/by-ids-with-risk's
  // riskLevel badge uses — 'none' when there are no summaries or none are
  // graded.
  riskLevel: z.enum(['none', 'mild', 'moderate', 'high']),
  // Display color derived 1:1 from riskLevel (none->GREEN, mild/moderate->
  // YELLOW, high->RED) — a convention introduced for the mobile/Supervisor
  // UI, not an existing backend rule confirmed elsewhere.
  riskColor: z.enum(['GREEN', 'YELLOW', 'RED']),
  statusHistory: z.array(statusHistoryEntrySchema),
  socioDemographics: socioDemographicsSchema.nullable(),
  lastVisitVitals: lastVisitVitalsSchema,
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
  totalActiveBeneficiaries: z.number().int(),
  activeMothersCount: z.number().int(),
  activeChildrenCount: z.number().int(),
  activeMothersHighRiskCount: z.number().int(),
  activeChildrenHighRiskCount: z.number().int(),
  activeMothersPercent: z.number().openapi({ example: 62.5 }),
  activeChildrenPercent: z.number().openapi({ example: 37.5 }),
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
export function registerBeneficiaryRoutes(doc: DocumentedRouter, service: BeneficiaryService) {
  const controller = createBeneficiaryController(service);

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
    controller.list,
  );

  doc.get(
    '/beneficiaries/ids',
    {
      summary:
        'Bare in-scope beneficiary ids (no PII, unpaginated) — for other services that own ' +
        'their own referral/visit/risk tables (no cross-service joins per the forklift rule) ' +
        'but need to filter those tables to one Sakhi/roster. Same role-scoping (sakhiId) as ' +
        'GET /beneficiaries, minus pagination/search/date-range.',
      tags: ['Beneficiaries'],
      responses: {
        200: { description: 'In-scope beneficiary ids', schema: envelope(z.array(z.string())) },
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idsQuerySchema, 'query'),
    controller.getIds,
  );

  doc.get(
    '/beneficiaries/pada-breakdown',
    {
      summary:
        'Pada Breakdown widget — one row per pada the in-scope beneficiaries live in, each ' +
        'with a resolved padaName/villageName and the beneficiaries (id + caseType) in that ' +
        'pada — caseType lets the caller split due/overdue/referral counts into a Women/Child ' +
        'breakdown without a second round-trip. A beneficiary with no padaId on record is ' +
        'excluded entirely — not grouped under a synthetic bucket. Same role-scoping ' +
        '(sakhiId) as GET /beneficiaries/ids.',
      tags: ['Beneficiaries'],
      responses: {
        200: {
          description: 'Pada breakdown of in-scope beneficiaries',
          schema: envelope(
            z.array(
              z.object({
                padaId: z.string().uuid(),
                padaName: z.string().nullable(),
                villageName: z.string().nullable(),
                beneficiaries: z.array(
                  z.object({ id: z.string().uuid(), caseType: z.enum(CASE_TYPES) }),
                ),
              }),
            ),
          ),
        },
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idsQuerySchema, 'query'),
    controller.getPadaBreakdown,
  );

  doc.get(
    '/beneficiaries/by-ids-with-risk',
    {
      summary:
        "Decrypted name/phone plus a 4-bucket riskLevel, for the pada visit-list screen's " +
        'cards. `ids` is a comma-separated list, further intersected server-side with the ' +
        "caller's own scope (SAKHI: own; SUPERVISOR: roster; MANAGER/ADMIN: unscoped) — an id " +
        'outside that scope, or simply not found, is absent from the result, not a 404 or ' +
        '403 (never trust a caller-supplied id list as pre-scoped). `search` narrows to an ' +
        'exact name-hash match (names are encrypted, no partial/fuzzy search). riskLevel is ' +
        'the worst current (BeneficiaryRiskConditionSummary.latestGrade) grade across the ' +
        "beneficiary's risk conditions, collapsed from RISK_GRADE's 6 values to 4 buckets: " +
        'NORMAL->none, MILD->mild, MODERATE->moderate, SEVERE/HIGH/CRITICAL->high.',
      tags: ['Beneficiaries'],
      responses: {
        200: {
          description: 'Beneficiaries with resolved name/phone/riskLevel',
          schema: envelope(
            z.array(
              z.object({
                id: z.string().uuid(),
                beneficiaryName: z.string(),
                phoneNumber: z.string().nullable(),
                villageId: z.string().uuid().nullable(),
                padaId: z.string().uuid().nullable(),
                riskLevel: z.enum(['none', 'mild', 'moderate', 'high']),
              }),
            ),
          ),
        },
        400: errorResponse(400, { message: 'ids: String must contain at least 1 character(s)' }),
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(byIdsWithRiskQuerySchema, 'query'),
    controller.getByIdsWithRisk,
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
    controller.getRegistrationSummary,
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
    controller.getRiskSummary,
  );

  // UNCONFIRMED alias for the Beneficiary Data Download screen's "Risk
  // Monitoring" row — "Risk Monitoring" has no definition anywhere in the
  // SRS/ERD/HLD or the reference app spec we have, so this is a best-guess
  // mapping to the closest existing thing (the risk-summary aggregate), not
  // a confirmed match. If "Risk Monitoring" turns out to mean something
  // else (e.g. a per-beneficiary trend rather than an aggregate), replace
  // this alias rather than trusting it.
  doc.get(
    '/risk-monitoring',
    {
      summary:
        'UNCONFIRMED alias for GET /beneficiaries/risk-summary — "Risk Monitoring" has no ' +
        'definition anywhere in the SRS/ERD/HLD; this is the closest existing match, not a ' +
        'confirmed one.',
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
    controller.getRiskSummary,
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
    controller.getById,
  );

  doc.get(
    '/beneficiaries/:id/ownership',
    {
      summary:
        'Bare {id, sakhiId, caseType} ownership check — for a server-to-server caller (e.g. ' +
        "visit-form-service's latest-visit-vitals resolver) that needs to verify whether this " +
        'caller may see this beneficiary without the full GET /beneficiaries/:id response, ' +
        'whose own enrichment (lastVisitVitals) calls back into visit-form-service — using ' +
        'GET /beneficiaries/:id here instead would recreate that same request cycle.',
      tags: ['Beneficiaries'],
      responses: {
        200: {
          description: 'Ownership fields retrieved',
          schema: envelope(
            z.object({
              id: z.string().uuid(),
              sakhiId: z.string().uuid(),
              caseType: z.enum(CASE_TYPES),
            }),
          ),
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
    controller.getOwnership,
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
    controller.create,
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
    controller.upsertSocioDemographics,
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
    controller.applyLmpChange,
  );

  doc.patch(
    '/beneficiaries/:id/phase',
    {
      summary:
        'Advance currentPhase after a visit submission (CR-041) — ' +
        "gated by requireRoles('SAKHI') since this codebase has no machine/service-account " +
        "identity: the call chain originates from a SAKHI's visit form submission " +
        "(visit-form-service -> here), forwarding the SAKHI's own token. Only ANC->PP (mother); " +
        'NN->NN, NN->INC, and INC->CCV (child) are accepted; any other transition 409s.',
      tags: ['Beneficiaries'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'currentPhase updated; the updated case is returned',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        400: errorResponse(400, { message: 'phase: Invalid enum value' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'This beneficiary case is outside your own roster.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        409: errorResponse(409, { message: 'Cannot move a MOTHER case from PP to ANC.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(idParamsSchema, 'params'),
    validateBody(updatePhaseSchema),
    controller.applyPhaseChange,
  );

  doc.patch(
    '/beneficiaries/:id/ccv-opening-risk-state',
    {
      summary:
        'Write ChildCaseDetails.ccvOpeningRiskState once, at the INC->CCV transition (BR-13) — ' +
        "gated by requireRoles('SAKHI') since this codebase has no machine/service-account " +
        'identity: the call chain originates from visitFormService right after its own ' +
        "PATCH .../phase call lands the case at CCV, forwarding the submitting SAKHI's own " +
        'token. 404s if no ChildCaseDetails row exists for this beneficiary.',
      tags: ['Beneficiaries'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'ccvOpeningRiskState updated; the updated case is returned',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        400: errorResponse(400, { message: 'ccvOpeningRiskState: Invalid enum value' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'This beneficiary case is outside your own roster.' }),
        404: errorResponse(404, {
          message: 'No ChildCaseDetails row exists for this beneficiary.',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(idParamsSchema, 'params'),
    validateBody(setCcvOpeningRiskStateSchema),
    controller.setCcvOpeningRiskState,
  );

  doc.patch(
    '/beneficiaries/:id/close',
    {
      summary:
        'Close a beneficiary case after a closure submission (ANC_CLOSURE_VISIT / ' +
        'CHILD_CLOSURE_VISIT) — intended to be called server-to-server by ' +
        "closure-reopen-service, forwarding the submitting SAKHI's own token for a " +
        "non-reviewed closure, or the deciding Supervisor's token once a MIGRATION closure " +
        'is approved. KNOWN GAP: this codebase has no machine/service-account identity, so ' +
        'this is also reachable directly by a SAKHI who owns the case, bypassing the ' +
        'closures audit row and any required supervisor review (see BeneficiaryService.' +
        'applyClosure doc comment) — tracked as a follow-up, not enforced here. Idempotent: ' +
        'closing an already-CLOSED case with the same reasonCode is a no-op success, not a ' +
        '409, since the mobile app may retry this call offline; a genuinely different ' +
        'reasonCode 409s instead of silently overwriting the audit trail.',
      tags: ['Beneficiaries'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'Case closed (or already CLOSED); the current case is returned',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        400: errorResponse(400, { message: 'reasonCode: Required' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'This beneficiary case is outside your own roster.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        409: errorResponse(409, { message: 'Unable to close this beneficiary case.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idParamsSchema, 'params'),
    validateBody(applyClosureSchema),
    controller.applyClosure,
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
    controller.upsertRiskConditionSummary,
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
    controller.reactivateCase,
  );
}
