import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createEventsController } from './events.controller';
import { createSupervisorEventSchema } from './dto/create-supervisorEvent.dto';
import { listSupervisorEventsQuerySchema } from './dto/list-supervisor-events.dto';
import { updateAttendanceSchema } from './dto/update-attendance.dto';
import { rescheduleEventSchema } from './dto/reschedule-event.dto';
import { createEventPhotoSchema } from './dto/create-event-photo.dto';
import { createGatheringSchema } from './dto/create-gathering.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
// topicsJson is built on z.lazy() (see create-supervisorEvent.dto.ts) —
// zod-to-openapi cannot introspect z.lazy() on its own, so `type: 'object'`
// is required here to short-circuit its type inference.
const createSupervisorEventRequestSchema = createSupervisorEventSchema.extend({
  topicsJson: createSupervisorEventSchema.shape.topicsJson.openapi({
    type: 'object',
    example: {},
  }),
});

const supervisorEventSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  supervisorId: z.string().uuid(),
  eventType: z.enum(['MEETING', 'TRAINING']),
  eventDate: z.string().datetime(),
  topicsJson: z.unknown(),
  remarks: z.string().nullable(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']),
  photoMediaId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const eventAttendanceSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  attendanceStatus: z.enum(['PRESENT', 'ABSENT', 'PARTIAL']),
  preTrainingScore: z.number().nullable(),
  postTrainingScore: z.number().nullable(),
  remarks: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const eventPhotoSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  mediaId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

const gatheringSchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  gatheringDate: z.string().datetime(),
  remarks: z.string().nullable(),
  status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const eventIdParamsSchema = z
  .object({
    id: z.string().uuid(),
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
 * Supervisor event (meetings/training) HTTP routes. Mounted under the
 * global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in the
 * same call as the Express route — the spec can never drift from what's mounted.
 */
export function registerEventsRoutes(doc: DocumentedRouter, service: OperationsService) {
  const controller = createEventsController(service);

  doc.get(
    '/supervisor-events',
    {
      summary: 'List recent supervisor events (meetings/training)',
      tags: ['Supervisor Operations'],
      query: listSupervisorEventsQuerySchema,
      responses: {
        200: { description: 'Supervisor events', schema: envelope(z.array(supervisorEventSchema)) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(listSupervisorEventsQuerySchema, 'query'),
    controller.list,
  );

  doc.post(
    '/supervisor-events',
    {
      summary: 'Create a supervisor event',
      tags: ['Supervisor Operations'],
      responses: {
        201: { description: 'Event created', schema: envelope(supervisorEventSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validateBody(createSupervisorEventRequestSchema),
    controller.create,
  );

  doc.get(
    '/supervisor-events/:id',
    {
      summary: 'Fetch a single supervisor event',
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        200: { description: 'Supervisor event', schema: envelope(supervisorEventSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    controller.getById,
  );

  doc.patch(
    '/supervisor-events/:id/cancel',
    {
      summary: 'Cancel a scheduled supervisor event',
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        200: { description: 'Event cancelled', schema: envelope(supervisorEventSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
        409: { description: 'Event is not in SCHEDULED status', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    controller.cancel,
  );

  doc.patch(
    '/supervisor-events/:id/complete',
    {
      summary: 'Complete a scheduled supervisor event (FR-SV-2.3)',
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        200: { description: 'Event completed', schema: envelope(supervisorEventSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
        409: { description: 'Event is not in SCHEDULED status', schema: apiErrorSchema },
        422: { description: 'Missing photo or attendance', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    controller.complete,
  );

  doc.get(
    '/supervisor-events/:id/attendance',
    {
      summary: "An event's attendance records (FR-SV-2.1/2.4)",
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        200: {
          description: 'Attendance for this event',
          schema: envelope(z.array(eventAttendanceSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    controller.getAttendance,
  );

  doc.put(
    '/supervisor-events/:id/attendance',
    {
      summary: 'Record attendance for an event (FR-SV-2.3)',
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        200: {
          description: 'Attendance recorded',
          schema: envelope(z.array(eventAttendanceSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    validateBody(updateAttendanceSchema),
    controller.updateAttendance,
  );

  doc.post(
    '/supervisor-events/:id/reschedule',
    {
      summary: "Reschedule a SCHEDULED event's date",
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        200: { description: 'Event rescheduled', schema: envelope(supervisorEventSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
        409: { description: 'Event is not in SCHEDULED status', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    validateBody(rescheduleEventSchema),
    controller.reschedule,
  );

  doc.post(
    '/supervisor-events/:id/photos',
    {
      summary: "Add a photo to an event's gallery",
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        201: { description: 'Photo added', schema: envelope(eventPhotoSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
        409: { description: 'Event is not in SCHEDULED status', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    validateBody(createEventPhotoSchema),
    controller.addPhoto,
  );

  doc.post(
    '/supervisor-events/:id/gatherings',
    {
      summary: 'Create a Training session (gathering) under a TRAINING event',
      tags: ['Supervisor Operations'],
      params: eventIdParamsSchema,
      responses: {
        201: { description: 'Gathering created', schema: envelope(gatheringSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this event', schema: apiErrorSchema },
        404: { description: 'Event not found', schema: apiErrorSchema },
        422: {
          description: 'Event is not TRAINING, or a topicId is missing/inactive',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(eventIdParamsSchema, 'params'),
    validateBody(createGatheringSchema),
    controller.createGathering,
  );
}
