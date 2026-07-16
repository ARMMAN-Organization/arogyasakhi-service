import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { BeneficiaryService } from './beneficiary.service';
import { createBeneficiarySchema } from './dto/create-beneficiary.dto';
import {
  asyncHandler,
  createDocumentedRouter,
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
  villageId: z.string().uuid().nullable(),
  padaId: z.string().uuid().nullable(),
  healthSubCentreId: z.string().uuid().nullable(),
  phcId: z.string().uuid().nullable(),
  healthBlockId: z.string().uuid().nullable(),
  dateOfBirth: z.string().datetime().nullable(),
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNKNOWN']).nullable(),
  stateId: z.string().uuid().nullable(),
  districtId: z.string().uuid().nullable(),
  talukaId: z.string().uuid().nullable(),
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
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'INTERSEX']).nullable(),
  birthWeightKg: z.number().nullable(),
  birthLengthCm: z.number().nullable(),
  prematureFlag: z.boolean().nullable(),
  linkedAncCase: z.boolean(),
});

const consentRecordSchema = z.object({
  consentType: z.string().openapi({ example: 'PROGRAM_ENROLLMENT' }),
  consentStatus: z.enum(['GIVEN', 'REFUSED']),
  consentDate: z.string().datetime(),
  capturedByUserId: z.string().uuid(),
});

// Fields mirror `model BeneficiaryCase` in prisma/schema.prisma — no invented
// fields — for accurate Swagger documentation only.
const beneficiaryCaseSchema = z.object({
  id: z.string().uuid(),
  piiId: z.string().uuid(),
  projectId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  caseType: z.enum(['MOTHER', 'CHILD']),
  registrationDate: z.string().datetime(),
  previousBeneficiaryId: z.string().uuid().nullable(),
  motherBeneficiaryId: z.string().uuid().nullable(),
  beneficiaryTypeLookupId: z.string().uuid(),
  caseTypeLookupId: z.string().uuid(),
  journeyStartDate: z.string().datetime(),
  currentPhase: z.enum(['ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV', 'CLOSED']),
  currentStatus: z.string().openapi({ example: 'ACTIVE' }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const beneficiaryCaseDetailSchema = beneficiaryCaseSchema.extend({
  pii: piiResponseSchema,
  motherCaseDetails: motherCaseDetailsSchema.nullable(),
  childCaseDetails: childCaseDetailsSchema.nullable(),
  consentRecords: z.array(consentRecordSchema),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
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
          schema: envelope(z.array(beneficiaryCaseSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.get(
    '/beneficiaries/:id',
    {
      summary: 'Get a beneficiary case by id',
      tags: ['Beneficiaries'],
      responses: {
        200: {
          description: 'Beneficiary case retrieved',
          schema: envelope(beneficiaryCaseDetailSchema),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Beneficiary case not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(idParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
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
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted (SAKHI only)', schema: apiErrorSchema },
        409: {
          description: 'A possible duplicate beneficiary already exists',
          schema: apiErrorSchema,
        },
        422: {
          description: 'Consent not received; registration cannot proceed',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createBeneficiarySchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.create(req.body, req.user.id);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
