import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createSupervisorEventSchema } from './dto/create-supervisorEvent.dto';
import { listSupervisorEventsQuerySchema } from './dto/list-supervisor-events.dto';
import { updateAttendanceSchema } from './dto/update-attendance.dto';
import { createInventoryItemSchema } from './dto/create-inventory-item.dto';
import { createInventoryTransactionSchema } from './dto/create-inventory-transaction.dto';
import { updateInventoryTransactionSchema } from './dto/update-inventory-transaction.dto';
import { createCallLogSchema } from './dto/create-call-log.dto';
import { updateCallLogSchema } from './dto/update-call-log.dto';
import { listRecentCallLogsQuerySchema } from './dto/list-recent-call-logs.dto';
import { createTrainingTopicSchema } from './dto/create-training-topic.dto';
import { rescheduleEventSchema } from './dto/reschedule-event.dto';
import { createEventPhotoSchema } from './dto/create-event-photo.dto';
import { createGatheringSchema } from './dto/create-gathering.dto';
import { updateGatheringAttendanceSchema } from './dto/update-gathering-attendance.dto';
import { completeTopicMarkSchema, createTopicMarkSchema } from './dto/create-topic-mark.dto';
import { topicMarkQuerySchema } from './dto/topic-mark-query.dto';
import {
  CALL_SHEET_STAT_KINDS,
  listCallSheetStatsBatchQuerySchema,
} from './dto/call-sheet-stats.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
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

const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  itemCategory: z.enum(['CONSUMABLE', 'INSTRUMENT']),
  unit: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const inventoryTransactionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  supervisorId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  itemId: z.string().uuid(),
  transactionType: z.enum(['HANDOVER', 'RETURNED', 'PERMANENT_DAMAGED', 'MISPLACED', 'CONSUMED']),
  quantity: z.number().int(),
  transactionDate: z.string().datetime(),
  remarks: z.string().nullable(),
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

const callLogSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  supervisorId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  callDatetime: z.string().datetime(),
  callStatus: z.enum([
    'PICKED_UP_TALKED',
    'PICKED_UP_NO_ONE_TALKING',
    'PICKED_UP_CUT_MIDWAY',
    'CALL_BACK',
    'NOT_PICKED_UP',
    'RINGING',
    'PHONE_OFF',
    'OUT_OF_NETWORK',
  ]),
  notes: z.string().nullable(),
  followupAction: z.string().nullable(),
  callStartAt: z.string().datetime(),
  callEndAt: z.string().datetime().nullable(),
  callDurationSeconds: z.number().int().nullable(),
  responder: z.enum(['RELATIVE', 'HUSBAND', 'SAKHI', 'PERSON_WHO_DOES_NOT_KNOW_WOMAN']).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const callSheetStatsSchema = z.object({
  sakhiId: z.string().uuid(),
  lastDataSyncDate: z.string().openapi({ example: '2026-08-04' }),
  rows: z.array(
    z.object({
      kind: z.enum(CALL_SHEET_STAT_KINDS),
      updated: z.number().int(),
      count: z.number().int(),
    }),
  ),
});

const sakhiIdParamsSchema = z
  .object({
    sakhiId: z.string().uuid(),
  })
  .strict();

const transactionIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const callLogIdParamsSchema = z
  .object({
    callLogId: z.string().uuid(),
  })
  .strict();

const eventIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

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

const trainingTopicSchema = z.object({
  id: z.string().uuid(),
  topicCode: z.string(),
  topicName: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
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

const createInventoryTransactionRequestSchema = createInventoryTransactionSchema;

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
 * Supervisor operations HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in the
 * same call as the Express route — the spec can never drift from what's mounted.
 */
export function createOperationsRouter(service: OperationsService) {
  const doc = createDocumentedRouter();

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
    asyncHandler(async (req, res) => {
      res.json(ok(await service.listEvents(req.query)));
    }),
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
    asyncHandler(async (req, res) => {
      const created = await service.createEvent(req.body);
      res.status(201).json(ok(created));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getEvent(req.params.id, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.cancelEvent(req.params.id, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.completeEvent(req.params.id, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getEventAttendance(req.params.id, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.updateEventAttendance(req.params.id, req.body, req.user)));
    }),
  );

  doc.get(
    '/inventory-items',
    {
      summary: 'List inventory items (consumables/instruments master data)',
      tags: ['Supervisor Operations'],
      responses: {
        200: { description: 'Inventory items', schema: envelope(z.array(inventoryItemSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listInventoryItems()));
    }),
  );

  doc.post(
    '/inventory-items',
    {
      summary: 'Create an inventory item (consumables/instruments master data)',
      tags: ['Supervisor Operations'],
      responses: {
        201: { description: 'Inventory item created', schema: envelope(inventoryItemSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        409: { description: 'itemCode already exists', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validateBody(createInventoryItemSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.createInventoryItem(req.body, req.user.id);
      res.status(201).json(ok(created));
    }),
  );

  doc.get(
    '/inventory-transactions',
    {
      summary: 'List recent inventory transactions',
      tags: ['Supervisor Operations'],
      responses: {
        200: {
          description: 'Inventory transactions',
          schema: envelope(z.array(inventoryTransactionSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listInventoryTransactions()));
    }),
  );

  doc.get(
    '/inventory-transactions/by-sakhi/:sakhiId',
    {
      summary: "One Sakhi's inventory transaction history",
      tags: ['Supervisor Operations'],
      params: sakhiIdParamsSchema,
      responses: {
        200: {
          description: 'Inventory transactions for this Sakhi',
          schema: envelope(z.array(inventoryTransactionSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sakhiIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(
          await service.listInventoryTransactionsBySakhi(
            req.params.sakhiId,
            req.user,
            authorizationHeader,
          ),
        ),
      );
    }),
  );

  doc.post(
    '/inventory-transactions',
    {
      summary: 'Record an inventory transaction (one or more items)',
      tags: ['Supervisor Operations'],
      responses: {
        201: {
          description: 'Inventory transaction(s) created',
          schema: envelope(z.array(inventoryTransactionSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        422: { description: 'Referenced item not found or inactive', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validateBody(createInventoryTransactionRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.createInventoryTransactions(
        req.body,
        req.user,
        authorizationHeader,
      );
      res.status(201).json(ok(created));
    }),
  );

  doc.put(
    '/inventory-transactions/:id',
    {
      summary: "Edit a transaction's quantity/date/remarks",
      tags: ['Supervisor Operations'],
      params: transactionIdParamsSchema,
      responses: {
        200: { description: 'Transaction updated', schema: envelope(inventoryTransactionSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Transaction not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(transactionIdParamsSchema, 'params'),
    validateBody(updateInventoryTransactionSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.updateInventoryTransaction(req.params.id, req.body, req.user);
      res.json(ok(updated));
    }),
  );

  doc.delete(
    '/inventory-transactions/:id',
    {
      summary: 'Delete an inventory transaction (soft delete)',
      tags: ['Supervisor Operations'],
      params: transactionIdParamsSchema,
      responses: {
        200: {
          description: 'Transaction deleted',
          schema: envelope(z.object({ deleted: z.literal(true) })),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Transaction not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(transactionIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      await service.deleteInventoryTransaction(req.params.id, req.user);
      res.json(ok({ deleted: true }));
    }),
  );

  doc.get(
    '/call-logs',
    {
      summary: 'List recent supervisor call-sheet records',
      tags: ['Supervisor Operations'],
      responses: {
        200: { description: 'Call logs', schema: envelope(z.array(callLogSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listCallLogs()));
    }),
  );

  doc.post(
    '/call-logs',
    {
      summary: 'Log a call (FR-SV-3.1/3.2)',
      tags: ['Supervisor Operations'],
      responses: {
        201: { description: 'Call log created', schema: envelope(callLogSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: 'Caller role not permitted, or Sakhi not assigned to caller',
          schema: apiErrorSchema,
        },
        422: { description: 'Referenced Sakhi not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validateBody(createCallLogSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.createCallLog(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(created));
    }),
  );

  doc.get(
    '/call-logs/:callLogId',
    {
      summary: "Fetch a single call log's full detail",
      tags: ['Supervisor Operations'],
      params: callLogIdParamsSchema,
      responses: {
        200: { description: 'Call log', schema: envelope(callLogSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this call log', schema: apiErrorSchema },
        404: { description: 'Call log not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(callLogIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getCallLog(req.params.callLogId, req.user)));
    }),
  );

  doc.patch(
    '/call-logs/:callLogId',
    {
      summary: 'Update a call after it ends (FR-SV-3.2)',
      tags: ['Supervisor Operations'],
      params: callLogIdParamsSchema,
      responses: {
        200: { description: 'Call log updated', schema: envelope(callLogSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this call log', schema: apiErrorSchema },
        404: { description: 'Call log not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(callLogIdParamsSchema, 'params'),
    validateBody(updateCallLogSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.updateCallLog(req.params.callLogId, req.body, req.user);
      res.json(ok(updated));
    }),
  );

  doc.get(
    '/call-logs/by-sakhi/:sakhiId',
    {
      summary: 'Full call history for a Sakhi, newest first (FR-SV-3.3)',
      tags: ['Supervisor Operations'],
      params: sakhiIdParamsSchema,
      responses: {
        200: { description: 'Call logs for this Sakhi', schema: envelope(z.array(callLogSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Sakhi not assigned to caller', schema: apiErrorSchema },
        404: { description: 'Sakhi not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sakhiIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(await service.listCallLogsBySakhi(req.params.sakhiId, req.user, authorizationHeader)),
      );
    }),
  );

  doc.get(
    '/call-logs/by-sakhi/:sakhiId/recent',
    {
      summary: 'Whether a Sakhi has been called recently (FR-SV-3.4 orange-highlight state)',
      tags: ['Supervisor Operations'],
      params: sakhiIdParamsSchema,
      query: listRecentCallLogsQuerySchema,
      responses: {
        200: {
          description: 'Recent call logs for this Sakhi',
          schema: envelope(z.array(callLogSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Sakhi not assigned to caller', schema: apiErrorSchema },
        404: { description: 'Sakhi not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sakhiIdParamsSchema, 'params'),
    validate(listRecentCallLogsQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const withinHours = req.query.withinHours ? Number(req.query.withinHours) : undefined;
      res.json(
        ok(
          await service.listRecentCallLogsBySakhi(
            req.params.sakhiId,
            req.user,
            authorizationHeader,
            withinHours,
          ),
        ),
      );
    }),
  );

  doc.get(
    '/call-sheet-stats/by-sakhi/:sakhiId',
    {
      summary: "A Sakhi's call-sheet stats card (7 fixed kind rows)",
      tags: ['Supervisor Operations'],
      params: sakhiIdParamsSchema,
      responses: {
        200: {
          description: 'Call-sheet stats for this Sakhi',
          schema: envelope(callSheetStatsSchema),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Sakhi not assigned to caller', schema: apiErrorSchema },
        404: { description: 'Sakhi not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sakhiIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(await service.getCallSheetStats(req.params.sakhiId, req.user, authorizationHeader)),
      );
    }),
  );

  doc.get(
    '/call-sheet-stats',
    {
      summary: 'Call-sheet stats for multiple Sakhis in one call (list-view card grid)',
      tags: ['Supervisor Operations'],
      query: listCallSheetStatsBatchQuerySchema,
      responses: {
        200: {
          description:
            'Call-sheet stats for every requested sakhiId the caller may access — an unauthorized or unknown id is silently omitted, not an error',
          schema: envelope(z.array(callSheetStatsSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listCallSheetStatsBatchQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const sakhiIds = String(req.query.sakhiIds)
        .split(',')
        .map((id) => id.trim());
      res.json(ok(await service.getCallSheetStatsBatch(sakhiIds, req.user, authorizationHeader)));
    }),
  );

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
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listTrainingTopics()));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.createTrainingTopic(req.body, req.user.id);
      res.status(201).json(ok(created));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.rescheduleEvent(req.params.id, req.body, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.addEventPhoto(req.params.id, req.body, req.user);
      res.status(201).json(ok(created));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.createGathering(req.params.id, req.body, req.user);
      res.status(201).json(ok(created));
    }),
  );

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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.listGatheringTopics(req.params.gatheringId, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getGatheringAttendance(req.params.gatheringId, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(
        ok(await service.updateGatheringAttendance(req.params.gatheringId, req.body, req.user)),
      );
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(
        ok(
          await service.getTopicMark(
            req.params.topicId,
            req.query as unknown as z.infer<typeof topicMarkQuerySchema>,
            req.user,
          ),
        ),
      );
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.upsertTopicMark(req.params.topicId, req.body, req.user)));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.completeTopicMark(req.params.topicId, req.body, req.user)));
    }),
  );

  return doc;
}
