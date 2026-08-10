import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createGatheringsController } from './gatherings.controller';
import { updateGatheringAttendanceSchema } from './dto/update-gathering-attendance.dto';
import { completeTopicMarkSchema, createTopicMarkSchema } from './dto/create-topic-mark.dto';
import { topicMarkQuerySchema } from './dto/topic-mark-query.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

// Mirrors trainingTopics.routes.ts's trainingTopicSchema — duplicated rather
// than imported since response/doc schemas live alongside their own routes
// file by design; this is the nested shape gatheringTopicSchema embeds.
const trainingTopicSchema = z.object({
  id: z.string().uuid(),
  topicCode: z.string(),
  topicName: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const gatheringTopicSchema = z.object({
  id: z.string().uuid(),
  gatheringId: z.string().uuid(),
  topicId: z.string().uuid(),
  topic: trainingTopicSchema,
});

const gatheringAttendanceSchema = z.object({
  id: z.string().uuid(),
  gatheringId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  attendanceStatus: z.enum(['PRESENT', 'ABSENT', 'PARTIAL']),
  remarks: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const topicMarkSchema = z.object({
  id: z.string().uuid(),
  gatheringId: z.string().uuid(),
  topicId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  markType: z.enum(['PRE', 'POST']),
  score: z.number(),
  isLocked: z.boolean(),
  lockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const gatheringIdParamsSchema = z
  .object({
    gatheringId: z.string().uuid(),
  })
  .strict();

const topicIdParamsSchema = z
  .object({
    topicId: z.string().uuid(),
  })
  .strict();

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
 * Gathering (Training session) and topic-mark HTTP routes. Mounted under
 * the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in the
 * same call as the Express route — the spec can never drift from what's mounted.
 */
export function registerGatheringsRoutes(doc: DocumentedRouter, service: OperationsService) {
  const controller = createGatheringsController(service);

  doc.get(
    '/gatherings/:gatheringId/topics',
    {
      summary: 'List the topics belonging to one gathering',
      tags: ['Supervisor Operations'],
      params: gatheringIdParamsSchema,
      responses: {
        200: { description: 'Gathering topics', schema: envelope(z.array(gatheringTopicSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this gathering', schema: apiErrorSchema },
        404: { description: 'Gathering not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(gatheringIdParamsSchema, 'params'),
    controller.listTopics,
  );

  doc.get(
    '/gatherings/:gatheringId/attendance',
    {
      summary: "A gathering's attendance records",
      tags: ['Supervisor Operations'],
      params: gatheringIdParamsSchema,
      responses: {
        200: {
          description: 'Attendance for this gathering',
          schema: envelope(z.array(gatheringAttendanceSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this gathering', schema: apiErrorSchema },
        404: { description: 'Gathering not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(gatheringIdParamsSchema, 'params'),
    controller.getAttendance,
  );

  doc.put(
    '/gatherings/:gatheringId/attendance',
    {
      summary: 'Record attendance for a gathering (Training session)',
      tags: ['Supervisor Operations'],
      params: gatheringIdParamsSchema,
      responses: {
        200: {
          description: 'Attendance recorded',
          schema: envelope(z.array(gatheringAttendanceSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this gathering', schema: apiErrorSchema },
        404: { description: 'Gathering not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(gatheringIdParamsSchema, 'params'),
    validateBody(updateGatheringAttendanceSchema),
    controller.updateAttendance,
  );

  doc.get(
    '/topics/:topicId/marks',
    {
      summary: 'Load a Pre/Post mark for one topic + gathering + Sakhi',
      tags: ['Supervisor Operations'],
      params: topicIdParamsSchema,
      query: topicMarkQuerySchema,
      responses: {
        200: { description: 'Topic mark', schema: envelope(topicMarkSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this gathering', schema: apiErrorSchema },
        404: { description: 'Gathering or mark not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(topicIdParamsSchema, 'params'),
    validate(topicMarkQuerySchema, 'query'),
    controller.getTopicMark,
  );

  doc.put(
    '/topics/:topicId/marks',
    {
      summary: 'Save a Pre/Post mark for one topic + gathering + Sakhi',
      tags: ['Supervisor Operations'],
      params: topicIdParamsSchema,
      responses: {
        200: { description: 'Topic mark saved', schema: envelope(topicMarkSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this gathering', schema: apiErrorSchema },
        404: { description: 'Gathering not found', schema: apiErrorSchema },
        409: { description: 'Mark is already locked', schema: apiErrorSchema },
        422: {
          description: 'Topic is not part of the referenced gathering',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(topicIdParamsSchema, 'params'),
    validateBody(createTopicMarkSchema),
    controller.upsertTopicMark,
  );

  doc.post(
    '/topics/:topicId/marks/complete',
    {
      summary: "Lock one topic's Pre or Post mark so it can no longer be edited",
      tags: ['Supervisor Operations'],
      params: topicIdParamsSchema,
      responses: {
        200: { description: 'Mark locked', schema: envelope(topicMarkSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this gathering', schema: apiErrorSchema },
        404: { description: 'Gathering or mark not found', schema: apiErrorSchema },
        409: { description: 'Mark is already locked', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(topicIdParamsSchema, 'params'),
    validateBody(completeTopicMarkSchema),
    controller.completeTopicMark,
  );
}
