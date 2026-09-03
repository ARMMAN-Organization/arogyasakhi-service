import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { QuickResponseService } from '../quick-response/quick-response.service';
import type { LmpChangeRequestService } from './lmp-change-request.service';
import { decideLmpChangeRequestSchema } from './dto/decide-lmp-change-request.dto';
import { createLmpChangeRequestSchema } from './dto/create-lmpChangeRequest.dto';
import {
  asyncHandler,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const idParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }) })
  .strict();

const listByBeneficiaryQuerySchema = z
  .object({
    beneficiaryId: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  })
  .strict();

const createLmpChangeRequestRequestSchema = createLmpChangeRequestSchema.extend({
  newLmpDate: createLmpChangeRequestSchema.shape.newLmpDate.openapi({
    type: 'string',
    format: 'date-time',
  }),
});

const decideLmpChangeRequestRequestSchema = decideLmpChangeRequestSchema.extend({
  decision: decideLmpChangeRequestSchema.shape.decision.openapi({ example: 'APPROVE' }),
});

const decideLmpChangeRequestResponseSchema = z.object({
  cardId: z.string().uuid(),
  cardSource: z.literal('approval_requests'),
  decision: z.string(),
});

const lmpChangeRequestDetailSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  oldLmpDate: z.string().nullable(),
  newLmpDate: z.string().nullable(),
  sonographyImageAssetId: z.string().uuid().nullable(),
  requestedByUserId: z.string().uuid(),
  requestedAt: z.string().datetime(),
  supervisorStatus: z.string().nullable(),
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
 * LMP Change Request HTTP routes. Mounted under the global `api/v1` prefix,
 * on the same `doc` router and `QuickResponseService` instance as Quick
 * Response's own routes — GET /:id and POST /:id/decision are thin,
 * dedicated-URL wrappers around the existing LMP_CHANGE card decision, not a
 * separate feature with its own data/logic. `:id` is the underlying
 * approval_requests row's own id.
 *
 * POST / and GET / (this file's own creation + beneficiary-scoped list) are
 * genuinely new: no code anywhere previously created an LMP_CHANGE approval
 * request. They're handled by the new `LmpChangeRequestService`, kept
 * separate from `QuickResponseService` (which already owns
 * decide/getDetail) rather than growing that file further.
 */
export function registerLmpChangeRequestRoutes(
  doc: DocumentedRouter,
  service: QuickResponseService,
  lmpChangeRequestService: LmpChangeRequestService,
) {
  doc.post(
    '/lmp-change-requests',
    {
      summary: "Raise a Sakhi's LMP change request (FR-SV-4.2)",
      tags: ['LMP Change Requests'],
      responses: {
        201: {
          description: 'LMP change request created',
          schema: envelope(lmpChangeRequestDetailSchema),
        },
        200: {
          description:
            'Idempotent replay — an LMP change request with this localRequestUuid ' +
            'already exists; the original is returned unchanged',
          schema: envelope(lmpChangeRequestDetailSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createLmpChangeRequestRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { detail, wasCreated } = await lmpChangeRequestService.create(
        req.body,
        req.user.id,
        authorizationHeader,
      );
      res.status(wasCreated ? 201 : 200).json(ok(detail));
    }),
  );

  doc.get(
    '/lmp-change-requests',
    {
      summary:
        "A beneficiary's LMP change request history, most-recent first — lets the Sakhi app " +
        'poll for status after submitting one (FR-SV-4.2). `beneficiaryId` is required.',
      tags: ['LMP Change Requests'],
      query: listByBeneficiaryQuerySchema,
      responses: {
        200: {
          description: "Beneficiary's LMP change requests (empty array if none)",
          schema: envelope(z.array(lmpChangeRequestDetailSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(listByBeneficiaryQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const result = await lmpChangeRequestService.listByBeneficiaryId(
        req.query.beneficiaryId as string,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  );

  doc.get(
    '/lmp-change-requests/:id',
    {
      summary:
        "An LMP Change request's own detail (mirrors /closures/:id, /reopen-requests/:id, " +
        '/referrals/:id)',
      tags: ['LMP Change Requests'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'LMP change request detail',
          schema: envelope(lmpChangeRequestDetailSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'LMP change request not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const result = await service.getLmpChangeRequestDetail(req.params.id, authorizationHeader);
      res.json(ok(result));
    }),
  );

  doc.post(
    '/lmp-change-requests/:id/decision',
    {
      summary: 'Decide an LMP Change request (FR-SV-4.2)',
      tags: ['LMP Change Requests'],
      params: idParamsSchema,
      responses: {
        200: {
          description: 'LMP change request decided',
          schema: envelope(decideLmpChangeRequestResponseSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'LMP change request not found', schema: apiErrorSchema },
        409: { description: 'Already decided', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(idParamsSchema, 'params'),
    validateBody(decideLmpChangeRequestRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const result = await service.decideLmpChangeRequest(
        req.params.id,
        req.body,
        req.user,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  );
}
