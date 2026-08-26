import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { LearnMoreService } from './learnMore.service';
import { createLearnMoreController } from './learnMore.controller';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const sectionCodeParamsSchema = z
  .object({ sectionCode: z.string().trim().min(1).openapi({ example: 'COMING_SOON' }) })
  .strict();

const topicCodeParamsSchema = z
  .object({ topicCode: z.string().trim().min(1).openapi({ example: 'COMING_SOON' }) })
  .strict();

const learnMoreSectionSchema = z.object({
  id: z.string().uuid(),
  sectionCode: z.string(),
  sectionName: z.string(),
  sortOrder: z.number().int(),
});

const learnMoreTopicSchema = z.object({
  id: z.string().uuid(),
  topicCode: z.string(),
  topicName: z.string(),
  mediaType: z.enum(['QNA_TEXT', 'PDF', 'INFOGRAPHIC', 'GIF', 'VIDEO', 'AUDIO']),
  contentUrl: z.string().nullable(),
  sortOrder: z.number().int(),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'NOT_FOUND' }),
  details: z.record(z.unknown()).optional(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Learn More knowledge-base routes (SRS FR-S-13.1-13.4). Mounted under the
 * global `api/v1` prefix. Currently serves the "Content coming soon"
 * placeholder — see learnMore.service.ts and prisma/seed.ts. Open to every
 * authenticated app role (read-only reference content, same posture as
 * risk-conditions/risk-parameters in risk-referral-service).
 */
export function registerLearnMoreRoutes(doc: DocumentedRouter, service: LearnMoreService) {
  const controller = createLearnMoreController(service);

  doc.get(
    '/learn-more/sections',
    {
      summary: 'List every ACTIVE Learn More section, ordered for display',
      tags: ['Learn More'],
      responses: {
        200: { description: 'Sections', schema: envelope(z.array(learnMoreSectionSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    controller.listSections,
  );

  doc.get(
    '/learn-more/sections/:sectionCode/topics',
    {
      summary: 'List every ACTIVE topic under a Learn More section, ordered for display',
      tags: ['Learn More'],
      params: sectionCodeParamsSchema,
      responses: {
        200: { description: 'Topics', schema: envelope(z.array(learnMoreTopicSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        404: { description: 'Section not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sectionCodeParamsSchema, 'params'),
    controller.listTopicsBySection,
  );

  doc.get(
    '/learn-more/topics/:topicCode',
    {
      summary:
        'Get one Learn More topic by its stable code — for FR-S-13.4 contextual in-form ' +
        "links (a form field's learnMoreTopicCode resolves via this route)",
      tags: ['Learn More'],
      params: topicCodeParamsSchema,
      responses: {
        200: { description: 'Topic', schema: envelope(learnMoreTopicSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        404: { description: 'Topic not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(topicCodeParamsSchema, 'params'),
    controller.getTopic,
  );
}
