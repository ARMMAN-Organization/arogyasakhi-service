import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RiskConditionService } from './riskCondition.service';
import { createRiskConditionController } from './riskCondition.controller';
import { listRiskConditionsQuerySchema } from './dto/list-risk-conditions.dto';
import { trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const riskConditionSchema = z.object({
  id: z.string().uuid(),
  conditionCode: z.string(),
  conditionName: z.string(),
  entityType: z.enum(['MOTHER', 'CHILD']),
  phase: z.enum(['REGISTRATION', 'ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV']),
  gradeScale: z.enum(['BINARY', 'NORMAL_MILD_MODERATE_SEVERE', 'NORMAL_LOW_MEDIUM_HIGH']),
  referralRequiredDefault: z.boolean(),
  educationRequiredDefault: z.boolean(),
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
 * Risk condition reference-data routes. Mounted under the global `api/v1`
 * prefix. Read-only lookup so callers outside this service (e.g.
 * visit-form-service resolving a self-reported condition's stable code to a
 * riskConditionId before pushing a BeneficiaryRiskConditionSummary row) never
 * need a direct query against risk_conditions (forklift rule).
 */
export function registerRiskConditionRoutes(doc: DocumentedRouter, service: RiskConditionService) {
  const controller = createRiskConditionController(service);

  doc.get(
    '/risk-conditions',
    {
      summary:
        'List risk conditions. With conditionCode OR ids (not both — 400 if both given), ' +
        'resolves a comma-separated batch of condition codes or riskConditionIds to their ' +
        'full rows (entries with no matching ACTIVE row are omitted from the response rather ' +
        'than failing the whole batch). With neither, returns every ACTIVE risk condition — ' +
        'the master-data download.',
      tags: ['Risk Conditions'],
      responses: {
        200: {
          description:
            'Risk condition rows — the full set when conditionCode is omitted, or the ' +
            'resolved subset matching the requested codes',
          schema: envelope(z.array(riskConditionSchema)),
        },
        400: {
          description: 'Malformed conditionCode/ids query param, or both given together',
          schema: apiErrorSchema,
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    validate(listRiskConditionsQuerySchema, 'query'),
    controller.list,
  );
}
