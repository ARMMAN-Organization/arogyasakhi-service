import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createVisitSummaryController } from './visitSummary.controller';
import { visitSummaryBySakhiQuerySchema } from './dto/visit-summary-by-sakhi-query.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const sakhiIdParamsSchema = z
  .object({
    sakhiId: z.string().uuid(),
  })
  .strict();

const visitSummarySchema = z.object({
  total: z.number().int(),
  byStatus: z.record(z.number().int()),
  endingSoonVisitsCount: z.number().int(),
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
 * Visit-summary-by-sakhi HTTP route (call-sheet screen's Visit Due / Visit 3
 * Days to Expire / Missed Visit rollup). Mounted under the global `api/v1`
 * prefix. This route is supervisor-facing only (SAKHI isn't in the roles
 * list) — unlike the visit-form-service endpoint it proxies, which a Sakhi
 * may also call for herself.
 */
export function registerVisitSummaryRoutes(doc: DocumentedRouter, service: OperationsService) {
  const controller = createVisitSummaryController(service);

  doc.get(
    '/visits/by-sakhi/:sakhiId/summary',
    {
      summary: 'Visit Due / Visit 3 Days to Expire / Missed Visit rollup for a Sakhi',
      tags: ['Supervisor Operations'],
      params: sakhiIdParamsSchema,
      query: visitSummaryBySakhiQuerySchema,
      responses: {
        200: { description: 'Visit summary for this Sakhi', schema: envelope(visitSummarySchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Sakhi not assigned to caller', schema: apiErrorSchema },
        404: { description: 'Sakhi not found', schema: apiErrorSchema },
        502: { description: 'Visit service unreachable or erroring', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sakhiIdParamsSchema, 'params'),
    validate(visitSummaryBySakhiQuerySchema, 'query'),
    controller.getBySakhi,
  );
}
