import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { QuickResponseService } from './quick-response.service';
import { listQuickResponseSchema } from './dto/list-quick-response.dto';
import { decideQuickResponseSchema } from './dto/decide-quick-response.dto';
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

const cardIdParamsSchema = z
  .object({
    cardId: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  })
  .strict();

const decideQuickResponseRequestSchema = decideQuickResponseSchema.extend({
  cardSource: decideQuickResponseSchema.shape.cardSource.openapi({ example: 'approval_requests' }),
  decision: decideQuickResponseSchema.shape.decision.openapi({ example: 'APPROVE' }),
});

const quickResponseCardSchema = z
  .object({
    cardId: z.string().uuid(),
    cardType: z.string().openapi({ example: 'REOPEN' }),
    cardSource: z.enum(['approval_requests', 'escalation_events']),
    beneficiaryId: z.string().uuid().nullable(),
    raisedAt: z.string().datetime(),
  })
  .passthrough();

const listQuickResponseResponseSchema = z.object({
  cards: z.array(quickResponseCardSchema),
  nextCursor: z.string().nullable(),
});

const decideQuickResponseResponseSchema = z.object({
  cardId: z.string().uuid(),
  cardSource: z.enum(['approval_requests', 'escalation_events']),
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
 * Quick Response HTTP routes. Mounted under the global `api/v1` prefix.
 * GET merges approval_requests + escalation_events (SUPERVISOR/MANAGER);
 * POST decides a card (SUPERVISOR only, per spec).
 */
export function createQuickResponseRouter(service: QuickResponseService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/quick-response',
    {
      summary: 'List Quick Response cards, merged from approval_requests and escalation_events',
      tags: ['Quick Response'],
      responses: {
        200: {
          description: 'Merged Quick Response cards',
          schema: envelope(listQuickResponseResponseSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(listQuickResponseSchema, 'query'),
    asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof listQuickResponseSchema>;
      res.json(ok(await service.list(query, authorizationHeader)));
    }),
  );

  doc.post(
    '/quick-response/:cardId/decision',
    {
      summary: 'Decide a Quick Response card',
      tags: ['Quick Response'],
      params: cardIdParamsSchema,
      responses: {
        200: { description: 'Card decided', schema: envelope(decideQuickResponseResponseSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Card not found', schema: apiErrorSchema },
        409: { description: 'Card already decided', schema: apiErrorSchema },
        501: {
          description: 'Decision not yet implemented for this card type',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(cardIdParamsSchema, 'params'),
    validateBody(decideQuickResponseRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const result = await service.decide(req.params.cardId, req.body, authorizationHeader);
      res.json(ok(result));
    }),
  );

  return doc;
}
