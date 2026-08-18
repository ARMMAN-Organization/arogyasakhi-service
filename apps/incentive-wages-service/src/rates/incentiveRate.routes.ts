import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { IncentiveRateService } from './incentiveRate.service';
import { createIncentiveRateController } from './incentiveRate.controller';
import { listActiveRateQuerySchema } from './dto/list-active-rate.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const incentiveRateSchema = z.object({
  id: z.string().uuid(),
  rateType: z.enum(['VISIT', 'REFERRAL', 'MEETING', 'TRAINING', 'RETAINER']),
  referralType: z.enum(['STANDARD', 'ACCOMPANIED']).nullable(),
  geographyUnitId: z.string().uuid().nullable(),
  amountInr: z.number().openapi({ example: 100 }),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable(),
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
 * Incentive rate HTTP routes. Mounted under the global `api/v1` prefix.
 * Read-only lookup — rates themselves are managed elsewhere (out of scope
 * here); this exists so a caller deciding an ACCOMPANIED_REFERRAL card
 * (FR-SV-4.9) can resolve the amount before creating an incentive event.
 */
export function registerIncentiveRateRoutes(doc: DocumentedRouter, service: IncentiveRateService) {
  const controller = createIncentiveRateController(service);

  doc.get(
    '/incentive-rates',
    {
      summary: 'Download the full incentive rate master list, for offline reference',
      tags: ['Incentives'],
      responses: {
        200: { description: 'All incentive rates', schema: envelope(z.array(incentiveRateSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    controller.listAll,
  );

  doc.get(
    '/incentive-rates/active',
    {
      summary: 'Resolve the currently effective incentive rate for a rate/referral type',
      tags: ['Incentives'],
      query: listActiveRateQuerySchema,
      responses: {
        200: { description: 'Active rate', schema: envelope(incentiveRateSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'No active rate found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listActiveRateQuerySchema, 'query'),
    controller.findActive,
  );
}
