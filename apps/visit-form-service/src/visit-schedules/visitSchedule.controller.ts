import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { VisitScheduleService } from './visitSchedule.service';
import {
  createVisitScheduleBulkSchema,
  MAX_BULK_SCHEDULE_ROWS,
} from './dto/create-visit-schedule-bulk.dto';
import { listVisitSchedulesQuerySchema } from './dto/list-visit-schedules.dto';
import { regenerateAncScheduleSchema } from './dto/regenerate-anc-schedule.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  errorResponse,
  ok,
  payloadTooLarge,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const createdScheduleSchema = z.object({
  localScheduleUuid: z.string().openapi({ example: '3f9a1234-....' }),
  scheduleId: z.string().uuid().openapi({ example: 'c7d8e5f0-....' }),
  status: z.string().openapi({ example: 'GENERATED' }),
});

const bulkResultSchema = z.object({
  beneficiaryId: z.string().uuid(),
  created: z.number().int(),
  alreadyExisted: z.number().int(),
  schedules: z.array(createdScheduleSchema),
});

const visitScheduleRowSchema = z.object({
  id: z.string().uuid(),
  localScheduleUuid: z.string(),
  beneficiaryId: z.string().uuid(),
  visitCode: z.string().openapi({ example: 'ANC1' }),
  visitType: z.string().openapi({ example: 'ANC' }),
  sequenceNo: z.number().int().nullable(),
  scheduledDate: z.string().datetime().openapi({ example: '2026-08-11T00:00:00.000Z' }),
  windowStartDate: z.string().datetime(),
  windowEndDate: z.string().datetime(),
  anchorType: z.string().openapi({ example: 'REGISTRATION' }),
  anchorVisitId: z.string().uuid().nullable(),
  generatedByRuleVersionId: z.string().uuid(),
  status: z.string().openapi({ example: 'OPEN' }),
  updatedAt: z.string().datetime(),
});

const visitScheduleListPageSchema = z.object({
  items: z.array(visitScheduleRowSchema),
  nextCursor: z.string().nullable().openapi({
    description: 'Pass back as `cursor` to fetch the next page; null when this is the last page.',
  }),
});

const regenerateAncResultSchema = z.object({
  supersededCount: z.number().int(),
  created: z.number().int(),
  schedules: z.array(createdScheduleSchema),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Rejects an oversized batch with 413 before it ever reaches validateBody's
 * Zod parse — a >100-row array.max() failure would otherwise surface as 400
 * VALIDATION_ERROR, not the 413 PAYLOAD_TOO_LARGE this endpoint's contract
 * requires. Deliberately tolerant of a malformed/missing `schedules` here;
 * validateBody catches that shape error right after this middleware runs.
 */
const rejectOversizedBatch: RequestHandler = (req, _res, next) => {
  const schedules = (req.body as { schedules?: unknown[] } | undefined)?.schedules;
  if (Array.isArray(schedules) && schedules.length > MAX_BULK_SCHEDULE_ROWS) {
    return next(
      payloadTooLarge(
        `schedules cannot exceed ${MAX_BULK_SCHEDULE_ROWS} rows (got ${schedules.length}).`,
      ),
    );
  }
  next();
};

/**
 * Visit schedule HTTP routes. Mounted under the global `api/v1` prefix.
 * Bulk upload only — the device is the author of these rows (FR-S-2.2/2.2A);
 * this service receives and stores them, it never generates a schedule
 * itself.
 */
export function createVisitScheduleRouter(service: VisitScheduleService) {
  const doc = createDocumentedRouter();

  doc.post(
    '/visit-schedules/bulk',
    {
      summary: "Upload a beneficiary's device-generated visit schedule (idempotent, transactional)",
      tags: ['Visit Schedules'],
      responses: {
        201: { description: 'Batch processed', schema: envelope(bulkResultSchema) },
        400: errorResponse(400, {
          message: 'generatedByRuleVersionId: unknown or not a published rule version.',
        }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        409: errorResponse(409, {
          message:
            'A schedule for visitCode "ANC3" already exists under a different localScheduleUuid.',
        }),
        413: errorResponse(413, { message: 'schedules cannot exceed 100 rows (got 101).' }),
        422: errorResponse(422, {
          message: 'anchorVisitLocalUuid "..." is not in this batch and not already stored.',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    rejectOversizedBatch,
    validateBody(createVisitScheduleBulkSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization') ?? '';
      const result = await service.createBulk(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(result));
    }),
  );

  doc.get(
    '/visit-schedules',
    {
      summary:
        "List/sync-pull a beneficiary's visit schedule (always beneficiary-scoped). " +
        'Filters: status, updatedAfter (delta sync). Cursor-paginated via cursor/limit ' +
        "(default 50, max 100) — pass the response's nextCursor back as `cursor` to fetch " +
        'the next page.',
      tags: ['Visit Schedules'],
      responses: {
        200: {
          description: 'Visit schedules retrieved',
          schema: envelope(visitScheduleListPageSchema),
        },
        400: errorResponse(400, { message: 'beneficiaryId: Required' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'You do not have access to this beneficiary.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listVisitSchedulesQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization') ?? '';
      const query = req.query as unknown as z.infer<typeof listVisitSchedulesQuerySchema>;
      const result = await service.list(query, req.user, authorizationHeader);
      res.json(ok(result));
    }),
  );

  doc.post(
    '/visit-schedules/regenerate-anc',
    {
      summary:
        "Regenerates a beneficiary's ANC schedule after a Supervisor-approved LMP/EDD change " +
        '(FR-SV-4.2) — the only sanctioned schedule-regeneration trigger. Supersedes every ' +
        'currently open ANC-family row before inserting the new ones. Server-to-server ' +
        'only — the production caller is beneficiary-service, not a Sakhi-initiated request.',
      tags: ['Visit Schedules'],
      responses: {
        200: { description: 'Schedule regenerated', schema: envelope(regenerateAncResultSchema) },
        400: errorResponse(400, {
          message: 'registrationDate: must be a date-only string (YYYY-MM-DD)',
        }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'You do not have access to this beneficiary.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
        502: errorResponse(502, {
          message: 'Unable to generate the ANC schedule — rules-service returned an error.',
        }),
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validateBody(regenerateAncScheduleSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization') ?? '';
      const { beneficiaryId, registrationDate, edd } = req.body;
      const result = await service.regenerateAncSchedule(
        beneficiaryId,
        registrationDate,
        edd,
        req.user,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  );

  return doc;
}
