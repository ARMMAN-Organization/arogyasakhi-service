import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { QuickResponseService } from '../quick-response/quick-response.service';
import { decideLmpChangeRequestSchema } from './dto/decide-lmp-change-request.dto';
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

const decideLmpChangeRequestRequestSchema = decideLmpChangeRequestSchema.extend({
  decision: decideLmpChangeRequestSchema.shape.decision.openapi({ example: 'APPROVE' }),
});

const decideLmpChangeRequestResponseSchema = z.object({
  cardId: z.string().uuid(),
  cardSource: z.literal('approval_requests'),
  decision: z.string(),
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
 * Response's own routes — this is a thin, dedicated-URL wrapper around the
 * existing LMP_CHANGE card decision, not a separate feature with its own
 * data/logic. `:id` is the underlying approval_requests row's own id.
 */
export function registerLmpChangeRequestRoutes(
  doc: DocumentedRouter,
  service: QuickResponseService,
) {
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
        req.user.id,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  );
}
