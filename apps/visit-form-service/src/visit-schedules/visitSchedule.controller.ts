import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { VisitScheduleService } from './visitSchedule.service';
import {
  createVisitScheduleBulkSchema,
  MAX_BULK_SCHEDULE_ROWS,
} from './dto/create-visit-schedule-bulk.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  errorResponse,
  ok,
  payloadTooLarge,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
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

  return doc;
}
