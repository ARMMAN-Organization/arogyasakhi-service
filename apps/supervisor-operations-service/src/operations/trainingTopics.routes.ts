import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createTrainingTopicsController } from './trainingTopics.controller';
import { createTrainingTopicSchema } from './dto/create-training-topic.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const trainingTopicSchema = z.object({
  id: z.string().uuid(),
  topicCode: z.string(),
  topicName: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
 * Training topic (topic-picker master data) HTTP routes. Mounted under the
 * global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in the
 * same call as the Express route — the spec can never drift from what's mounted.
 */
export function registerTrainingTopicsRoutes(doc: DocumentedRouter, service: OperationsService) {
  const controller = createTrainingTopicsController(service);

  doc.get(
    '/training-topics',
    {
      summary: 'List training topics (topic-picker master data)',
      tags: ['Supervisor Operations'],
      responses: {
        200: { description: 'Training topics', schema: envelope(z.array(trainingTopicSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    controller.list,
  );

  doc.post(
    '/training-topics',
    {
      summary: 'Create a training topic (topic-picker master data)',
      tags: ['Supervisor Operations'],
      responses: {
        201: { description: 'Training topic created', schema: envelope(trainingTopicSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        409: { description: 'topicCode already exists', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validateBody(createTrainingTopicSchema),
    controller.create,
  );
}
