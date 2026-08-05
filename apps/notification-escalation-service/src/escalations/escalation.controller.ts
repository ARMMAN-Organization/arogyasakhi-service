import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { EscalationService } from './escalation.service';
import {
  listEscalationEventsSchema,
  type ListEscalationEventsInput,
} from './dto/list-escalation-events.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  validate,
} from '../app.module';

extendZodWithOpenApi(z);

const escalationCardSchema = z.object({
  cardId: z.string().uuid(),
  cardType: z.enum(['MISSED_VISIT', 'EDD_NEARING']),
  cardSource: z.literal('escalation_events'),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  referralId: z.string().uuid().nullable(),
  escalationType: z.string().openapi({ example: 'ANC_2_MISSED' }),
  status: z.string().openapi({ example: 'OPEN' }),
  raisedAt: z.string().datetime(),
});

const listEscalationEventsResponseSchema = z.object({
  cards: z.array(escalationCardSchema),
  nextCursor: z.string().nullable(),
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
 * Escalation event HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * This is an internal, service-to-service read surface — approval-service
 * calls it directly (not through the gateway, matching supervisor-operations-
 * service's SakhiClient precedent) to merge escalation-sourced Quick Response
 * cards (MISSED_VISIT, EDD_NEARING) alongside its own approval_requests.
 */
export function createEscalationRouter(service: EscalationService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/escalation-events',
    {
      summary: 'List escalation events shaped as Quick Response cards',
      tags: ['Escalations'],
      responses: {
        200: {
          description: 'Escalation-sourced Quick Response cards',
          schema: envelope(listEscalationEventsResponseSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(listEscalationEventsSchema, 'query'),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as ListEscalationEventsInput;
      res.json(ok(await service.list(query)));
    }),
  );

  return doc;
}
