import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RiskBySakhiService } from './riskBySakhi.service';
import { createRiskBySakhiController } from './riskBySakhi.controller';
import {
  riskBySakhiParamsSchema,
  riskBySakhiQuerySchema,
  RISK_BY_SAKHI_TYPES,
} from './dto/get-risk-by-sakhi.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

// RISK_GRADE's 6 values (see auth-service seed-data.ts) — null when a flag's
// riskGradeLookupValueId doesn't resolve to a known RISK_GRADE value.
const riskGradeSchema = z
  .enum(['NORMAL', 'MILD', 'MODERATE', 'SEVERE', 'HIGH', 'CRITICAL'])
  .nullable();

const riskConditionSummarySchema = z.object({
  riskConditionId: z.string().uuid(),
  conditionName: z.string(),
  phase: z.enum(['REGISTRATION', 'ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV']),
  baselineGrade: riskGradeSchema,
  baselineObservedValue: z.record(z.unknown()).nullable(),
  baselineAssessedAt: z.string().datetime(),
  latestGrade: riskGradeSchema,
  latestObservedValue: z.record(z.unknown()).nullable(),
  latestAssessedAt: z.string().datetime(),
  everHighestGrade: riskGradeSchema,
  everAtRiskFlag: z.boolean(),
});

const beneficiaryRiskConditionSummariesSchema = z.object({
  beneficiaryId: z.string().uuid(),
  riskConditionSummaries: z.array(riskConditionSummarySchema),
});

const riskBySakhiResponseSchema = z.object({
  sakhiId: z.string().uuid(),
  type: z.enum(RISK_BY_SAKHI_TYPES).nullable(),
  beneficiaries: z.array(beneficiaryRiskConditionSummariesSchema),
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
 * Risk-by-sakhi HTTP routes. Mounted under the global `api/v1` prefix. Gives
 * a Sakhi/Supervisor-facing screen a roster-wide risk view — one call
 * instead of one `GET /beneficiaries/:id/risk-state` per beneficiary. Not
 * part of the SRS/ERD/HLD as a dedicated endpoint.
 */
export function registerRiskBySakhiRoutes(doc: DocumentedRouter, service: RiskBySakhiService) {
  const controller = createRiskBySakhiController(service);

  doc.get(
    '/risk/by-sakhi/:sakhiId',
    {
      summary:
        'Per-condition risk-state summaries (see GET /beneficiaries/:beneficiaryId/risk-state) ' +
        "for every beneficiary on a Sakhi's caseload, optionally filtered by `type` to the ANC " +
        'phase or the PNC phase (DELIVERY + PP + NN). A SAKHI may only read her own sakhiId; a ' +
        'SUPERVISOR only a sakhiId on their own roster (resolved via auth-service). MANAGER/ADMIN ' +
        'are unscoped.',
      tags: ['Risk By Sakhi'],
      params: riskBySakhiParamsSchema,
      query: riskBySakhiQuerySchema,
      responses: {
        200: {
          description:
            'beneficiaries is empty (not a 404) when the Sakhi has no beneficiaries in scope. ' +
            'Each beneficiary present has riskConditionSummaries empty (not omitted) when it has ' +
            'no risk data matching the requested type.',
          schema: envelope(riskBySakhiResponseSchema),
        },
        400: {
          description: 'Malformed sakhiId, or an unrecognized type value',
          schema: apiErrorSchema,
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or sakhiId outside the caller's scope",
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(riskBySakhiParamsSchema, 'params'),
    validate(riskBySakhiQuerySchema, 'query'),
    controller.getRiskBySakhi,
  );
}
