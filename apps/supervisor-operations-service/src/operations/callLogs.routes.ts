import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createCallLogsController } from './callLogs.controller';
import { createCallLogSchema } from './dto/create-call-log.dto';
import { updateCallLogSchema } from './dto/update-call-log.dto';
import { listRecentCallLogsQuerySchema } from './dto/list-recent-call-logs.dto';
import {
  CALL_SHEET_STAT_KINDS,
  listCallSheetStatsBatchQuerySchema,
} from './dto/call-sheet-stats.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

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

const callLogIdParamsSchema = z
  .object({
    callLogId: z.string().uuid(),
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
 * Supervisor call-log HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in the
 * same call as the Express route — the spec can never drift from what's mounted.
 */
export function registerCallLogsRoutes(doc: DocumentedRouter, service: OperationsService) {
  const controller = createCallLogsController(service);

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
    controller.list,
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
    controller.create,
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
    controller.getById,
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
    controller.update,
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
    controller.listBySakhi,
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
    controller.listRecentBySakhi,
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
    controller.getCallSheetStatsBySakhi,
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
    controller.getCallSheetStatsBatch,
  );
}
