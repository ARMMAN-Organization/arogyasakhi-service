import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createSupervisorEventSchema } from './dto/create-supervisorEvent.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

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
      responses: {
        200: { description: 'Supervisor events', schema: envelope(z.array(supervisorEventSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listEvents()));
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
    validateBody(createSupervisorEventSchema),
    asyncHandler(async (req, res) => {
      const created = await service.createEvent(req.body);
      res.status(201).json(ok(created));
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
    requireRoles('SUPERVISOR', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listInventoryItems()));
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
    requireRoles('SUPERVISOR', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listInventoryTransactions()));
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

  return doc;
}
