import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { QuickResponseService } from './quick-response.service';
import { createQuickResponseController } from './quick-response.controller';
import { listQuickResponseSchema } from './dto/list-quick-response.dto';
import { decideQuickResponseSchema } from './dto/decide-quick-response.dto';
import { getQuickResponseDetailsSchema } from './dto/get-quick-response-details.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
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
    // Only populated for cardSource: 'approval_requests' — escalation_events
    // cards' own name enrichment is owned by notification-escalation-service.
    beneficiaryName: z.string().nullable().optional(),
    sakhiName: z.string().nullable().optional(),
  })
  .passthrough();

const listQuickResponseResponseSchema = z.object({
  cards: z.array(quickResponseCardSchema),
  nextCursor: z.string().nullable(),
});

const quickResponseDetailsResponseSchema = z.array(quickResponseCardSchema);

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
export function registerQuickResponseRoutes(doc: DocumentedRouter, service: QuickResponseService) {
  const controller = createQuickResponseController(service);

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
    controller.list,
  );

  // Registered before '/quick-response/:cardId' — Express matches routes in
  // registration order, so if this came after, the literal 'details' segment
  // would be swallowed by :cardId's z.string().uuid() validator and always
  // 400 with "cardId: Invalid uuid" for the comma-joined batch value.
  doc.get(
    '/quick-response/details',
    {
      summary:
        'Batch detail lookup for multiple Quick Response cards in one call, backing the ' +
        "Supervisor app's card-detail screen so it doesn't issue one request per card. " +
        'Ids that are not found, inaccessible to the caller, or fail enrichment are silently ' +
        'omitted from the result rather than failing the whole batch.',
      tags: ['Quick Response'],
      query: getQuickResponseDetailsSchema,
      responses: {
        200: {
          description:
            'Resolved card details for the requested, accessible ids (may be fewer ' +
            'than requested)',
          schema: envelope(quickResponseDetailsResponseSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(getQuickResponseDetailsSchema, 'query'),
    controller.getCardDetails,
  );

  doc.get(
    '/quick-response/:cardId',
    {
      summary:
        'Per-card-type detail for one Quick Response card — the list envelope only carries ' +
        'the thin {cardId, cardType, cardSource, beneficiaryId, raisedAt} shape, not enough ' +
        "to render any of the 8 cards' own content. Fields vary by cardType (see " +
        'QuickResponseService.getCardDetail); two fields are deliberately never returned — ' +
        "LMP Change's sonography image and Accompanied Referral's photo evidence — since " +
        'neither has an upload path built yet.',
      tags: ['Quick Response'],
      params: cardIdParamsSchema,
      responses: {
        200: {
          description: 'Card detail, shape varies by cardType',
          schema: envelope(quickResponseCardSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Card not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(cardIdParamsSchema, 'params'),
    controller.getCardDetail,
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
    controller.decide,
  );
}
