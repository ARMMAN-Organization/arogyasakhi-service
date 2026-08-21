import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { EscalationsBySakhiService } from './escalations-by-sakhi.service';
import { createEscalationsBySakhiController } from './escalations-by-sakhi.controller';
import {
  escalationsBySakhiParamsSchema,
  escalationsBySakhiQuerySchema,
} from './dto/get-escalations-by-sakhi.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const escalationCardSchema = z.object({
  cardId: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  escalationType: z.enum(['CLOSURE_PENDING', 'DELIVERY_FORM_PENDING']),
  status: z.string().openapi({ example: 'OPEN' }),
  raisedAt: z.string().datetime(),
});

const escalationsBySakhiResponseSchema = z.object({
  cards: z.array(escalationCardSchema),
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
 * Escalations-by-sakhi HTTP routes. Mounted under the global `api/v1`
 * prefix. Lists a Sakhi's beneficiaries with a pending closure or delivery
 * form — one call instead of one GET /escalation-events?status=OPEN check
 * per beneficiary. Mirrors risk-referral-service's
 * GET /risk/by-sakhi/:sakhiId.
 */
export function registerEscalationsBySakhiRoutes(
  doc: DocumentedRouter,
  service: EscalationsBySakhiService,
) {
  const controller = createEscalationsBySakhiController(service);

  doc.get(
    '/escalations/by-sakhi/:sakhiId',
    {
      summary:
        "Beneficiaries with a pending closure or delivery form on a Sakhi's caseload. `type` " +
        'is a required, comma-separated list restricted to CLOSURE_PENDING/DELIVERY_FORM_PENDING ' +
        '(e.g. `?type=CLOSURE_PENDING,DELIVERY_FORM_PENDING`). A SAKHI may only read her own ' +
        'sakhiId; a SUPERVISOR only a sakhiId on their own roster (resolved via auth-service). ' +
        'MANAGER/ADMIN are unscoped.',
      tags: ['Escalations'],
      params: escalationsBySakhiParamsSchema,
      query: escalationsBySakhiQuerySchema,
      responses: {
        200: {
          description:
            'cards is empty (not a 404) when the Sakhi has no beneficiaries in scope, or none ' +
            'have a matching pending escalation.',
          schema: envelope(escalationsBySakhiResponseSchema),
        },
        400: {
          description: 'Malformed sakhiId, missing type, or an unrecognized type value',
          schema: apiErrorSchema,
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or sakhiId outside the caller's scope",
          schema: apiErrorSchema,
        },
        502: { description: 'beneficiary-service unreachable or errored', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(escalationsBySakhiParamsSchema, 'params'),
    validate(escalationsBySakhiQuerySchema, 'query'),
    controller.getEscalationsBySakhi,
  );
}
