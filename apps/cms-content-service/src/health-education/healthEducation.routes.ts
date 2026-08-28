import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { HealthEducationService } from './healthEducation.service';
import { createHealthEducationController } from './healthEducation.controller';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const listMessagesQuerySchema = z
  .object({
    riskConditionId: z.string().uuid().optional(),
    stage: z.string().trim().min(1).optional(),
  })
  .strict();

const healthEducationMessageSchema = z.object({
  id: z.string().uuid(),
  riskConditionId: z.string().uuid().nullable(),
  conditionLabel: z.string(),
  stage: z.string(),
  messageOrder: z.number().int(),
  titleEn: z.string().nullable(),
  bodyEn: z.string(),
  bodyMarathi: z.string(),
  mediaType: z.enum(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO']),
  mediaFile: z.string().nullable(),
  sortOrder: z.number().int(),
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
 * Health education message routes (SRS FR-S-5.2(c)). Mounted under the
 * global `api/v1` prefix. Currently serves ARMMAN's delivered English
 * content with a placeholder bodyMarathi on every row — see
 * prisma/seed-data/health-education-messages.json and this feature's
 * implementation plan doc. riskConditionId is null on every seeded row
 * today (no confident condition mapping yet); filtering by stage is the
 * only way to retrieve general/non-risk-linked messages until that
 * mapping exists.
 */
export function registerHealthEducationRoutes(
  doc: DocumentedRouter,
  service: HealthEducationService,
) {
  const controller = createHealthEducationController(service);

  doc.get(
    '/health-education/messages',
    {
      summary:
        'List health education messages, optionally filtered by riskConditionId and/or ' +
        'stage — either, both, or neither (no filter returns every message).',
      tags: ['Health Education'],
      query: listMessagesQuerySchema,
      responses: {
        200: { description: 'Messages', schema: envelope(z.array(healthEducationMessageSchema)) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listMessagesQuerySchema, 'query'),
    controller.listMessages,
  );
}
