import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RiskConditionService } from './riskCondition.service';
import { listRiskConditionsQuerySchema } from './dto/list-risk-conditions.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  trustGatewayIdentity,
  validate,
} from '../app.module';

extendZodWithOpenApi(z);

const riskConditionLookupSchema = z.object({
  conditionCode: z.string(),
  riskConditionId: z.string().uuid(),
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
export function createRiskConditionRouter(service: RiskConditionService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/risk-conditions',
    {
      summary:
        'Resolve a comma-separated batch of condition codes to their riskConditionId. ' +
        'Codes with no matching ACTIVE row are omitted from the response rather than ' +
        'failing the whole batch.',
      tags: ['Risk Conditions'],
      responses: {
        200: {
          description: 'Resolved condition lookups (may be a subset of the requested codes)',
          schema: envelope(z.array(riskConditionLookupSchema)),
        },
        400: { description: 'Missing/malformed conditionCode query param', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    validate(listRiskConditionsQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const codes = String(req.query.conditionCode)
        .split(',')
        .map((c) => c.trim());
      const found = await service.listByConditionCodes(codes);
      res.json(ok(found));
    }),
  );

  return doc;
}
