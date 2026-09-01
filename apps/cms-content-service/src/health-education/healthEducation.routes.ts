import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { HealthEducationService } from './healthEducation.service';
import { createHealthEducationController } from './healthEducation.controller';
import {
  errorResponse,
  requireRoles,
  trustGatewayIdentity,
  validate,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const listMessagesQuerySchema = z
  .object({
    riskConditionId: z.string().uuid().optional(),
    stage: z.string().trim().min(1).optional(),
    // Matched against conditionLabel verbatim (see model doc comment on
    // HealthEducationMessage) — used by risk-referral-service's condition
    // -code-to-label map until riskConditionId is backfilled on these rows.
    conditionLabel: z.string().trim().min(1).optional(),
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
        400: errorResponse(400),
        401: errorResponse(401),
        403: errorResponse(403),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listMessagesQuerySchema, 'query'),
    controller.listMessages,
  );
}
