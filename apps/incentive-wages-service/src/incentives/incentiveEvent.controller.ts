import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { IncentiveEventService } from './incentiveEvent.service';
import { createIncentiveEventSchema } from './dto/create-incentiveEvent.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const incentiveEventSchema = z.object({
  id: z.string().uuid(),
  sakhiId: z.string().uuid(),
  sourceEntityType: z
    .enum(['VISIT', 'REFERRAL', 'MEETING', 'TRAINING', 'RETAINER'])
    .openapi({ example: 'VISIT' }),
  sourceEntityId: z.string().nullable(),
  eventMonth: z.string().datetime(),
  rateId: z.string().uuid(),
  quantity: z.number().openapi({ example: 1 }),
  amountInr: z.number().openapi({ example: 150 }),
  eligibilityStatus: z
    .enum(['ELIGIBLE', 'INELIGIBLE', 'PENDING', 'REVERSED'])
    .openapi({ example: 'ELIGIBLE' }),
  calculatedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
 * Incentive event HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in
 * the same call as the Express route itself — the request body schema is
 * inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createIncentiveEventRouter(service: IncentiveEventService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/incentives',
    {
      summary: 'List the most recent incentive events',
      tags: ['Incentives'],
      responses: {
        200: {
          description: 'Incentive events',
          schema: envelope(z.array(incentiveEventSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('MANAGER', 'ADMIN'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/incentives',
    {
      summary: 'Record a new incentive event',
      tags: ['Incentives'],
      responses: {
        201: { description: 'Incentive event created', schema: envelope(incentiveEventSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validateBody(createIncentiveEventSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
