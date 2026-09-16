import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { HealthEducationService } from './healthEducation.service';
import type { HealthEducationMediaSyncService } from './healthEducationMedia.syncService';
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
  mediaResolvedUrl: z
    .string()
    .nullable()
    .openapi({
      description:
        'Absolute, playable URL for mediaFile, resolved via Strapi. Null until ' +
        'POST /health-education/media-sync has run and found a matching Strapi entry.',
    }),
  sortOrder: z.number().int(),
});

const mediaSyncSkippedItemSchema = z.object({
  slug: z.string().nullable(),
  reason: z.string(),
});

const mediaSyncSummarySchema = z.object({
  entriesResolved: z.number().int(),
  messagesUpdated: z.number().int(),
  skipped: z.array(mediaSyncSkippedItemSchema),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Health education message routes (SRS FR-S-5.2(c)). Mounted under the
 * global `api/v1` prefix. Serves ARMMAN's delivered English and Marathi
 * content — bodyMarathi is ARMMAN-sourced translated text on 30 of 32 rows;
 * the remaining 2 (Post miscarriage/abortion/still birth, Dehydration) have
 * an AI-generated Marathi translation standing in for content ARMMAN has
 * not yet delivered — see prisma/seed-data/health-education-messages.json
 * and this feature's implementation plan doc. riskConditionId is null on every seeded row
 * today (no confident condition mapping yet); filtering by stage is the
 * only way to retrieve general/non-risk-linked messages until that
 * mapping exists.
 */
export function registerHealthEducationRoutes(
  doc: DocumentedRouter,
  service: HealthEducationService,
  mediaSyncService: HealthEducationMediaSyncService,
) {
  const controller = createHealthEducationController(service, mediaSyncService);

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

  doc.post(
    '/health-education/media-sync',
    {
      summary:
        'Manually pull current health-education media from Strapi and resolve ' +
        "HealthEducationMessage.mediaResolvedUrl by matching each Strapi entry's slug " +
        'against mediaFile. Admin-triggered only — no automatic schedule/webhook exists ' +
        'yet, same pattern as POST /learn-more/sync.',
      tags: ['Health Education'],
      responses: {
        200: { description: 'Sync summary', schema: envelope(mediaSyncSummarySchema) },
        401: errorResponse(401),
        403: errorResponse(403, { message: 'Forbidden — ADMIN role required' }),
        502: errorResponse(502, { message: 'Strapi unreachable or returned an error' }),
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    controller.syncMedia,
  );
}
