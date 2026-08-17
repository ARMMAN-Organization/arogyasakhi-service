import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RiskParameterService } from './riskParameter.service';
import { createRiskParameterController } from './riskParameter.controller';
import { listRiskParametersQuerySchema } from './dto/list-risk-parameters.dto';
import { trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const riskParameterSchema = z.object({
  id: z.string().uuid(),
  parameterCode: z.string(),
  parameterName: z.string(),
  entityType: z.enum(['MOTHER', 'CHILD']),
  unit: z.string().nullable(),
  dataType: z.enum(['NUMERIC', 'BOOLEAN', 'CATEGORICAL']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
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
 * Risk parameter reference-data routes. Mounted under the global `api/v1`
 * prefix. Read-only lookup for the raw measurable clinical dimension (e.g.
 * "SYSTOLIC_BP", "HEMOGLOBIN") that feeds a rules-service rule evaluation —
 * distinct from `/risk-conditions`, which is the resulting diagnosed/flagged
 * condition after grading. Backs the Supervisor app's "Download Master Data"
 * → "Risk Parameter" row.
 */
export function registerRiskParameterRoutes(doc: DocumentedRouter, service: RiskParameterService) {
  const controller = createRiskParameterController(service);

  doc.get(
    '/risk-parameters',
    {
      summary:
        'List risk parameters. With parameterCode, resolves a comma-separated batch of ' +
        'parameter codes to their full rows (codes with no matching ACTIVE row are omitted ' +
        'from the response rather than failing the whole batch). Without parameterCode, ' +
        'returns every ACTIVE risk parameter — the master-data download.',
      tags: ['Risk Parameters'],
      responses: {
        200: {
          description:
            'Risk parameter rows — the full set when parameterCode is omitted, or the ' +
            'resolved subset matching the requested codes',
          schema: envelope(z.array(riskParameterSchema)),
        },
        400: { description: 'Malformed parameterCode query param', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    validate(listRiskParametersQuerySchema, 'query'),
    controller.listByParameterCodes,
  );
}
