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
    'CONNECTED',
    'NOT_CONNECTED',
    'FOLLOWUP_REQUIRED',
    'BUSY',
    'SWITCHED_OFF',
    'WRONG_NUMBER',
  ]),
  notes: z.string().nullable(),
  followupAction: z.string().nullable(),
  callStartAt: z.string().datetime(),
  callEndAt: z.string().datetime().nullable(),
  callDurationSeconds: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
    '/gatherings/:id/attendance',
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
    '/gatherings/:id/attendance',
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
    '/items',
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
    '/items',
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
    '/inventory-transactions/sakhi/:sakhiId',
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
    '/call-logs/sakhi/:sakhiId',
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
    '/call-logs/sakhi/:sakhiId/recent',
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

  return doc;
}
