import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { VisitScheduleService } from './visitSchedule.service';
import { createVisitScheduleController } from './visitSchedule.controller';
import {
  createVisitScheduleBulkSchema,
  MAX_BULK_SCHEDULE_ROWS,
} from './dto/create-visit-schedule-bulk.dto';
import { generateVisitScheduleSchema } from './dto/generate-visit-schedule.dto';
import { listVisitSchedulesQuerySchema } from './dto/list-visit-schedules.dto';
import {
  errorResponse,
  payloadTooLarge,
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
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

const generateResultSchema = bulkResultSchema.extend({
  evaluation: z.record(z.unknown()).openapi({
    description:
      "The rules-service pack's raw evaluation output, for the caller to inspect " +
      '(e.g. DELIVERY returns a dispatch decision with no schedule rows of its own).',
  }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

// Fields mirror `model VisitSchedule` in prisma/schema.prisma exactly — no
// invented fields — for accurate Swagger documentation only.
const visitScheduleSchema = z.object({
  id: z.string().uuid(),
  localScheduleUuid: z.string(),
  beneficiaryId: z.string().uuid(),
  visitCode: z.string(),
  visitType: z.string(),
  sequenceNo: z.number().int().nullable(),
  scheduledDate: z.string(),
  windowStartDate: z.string(),
  windowEndDate: z.string(),
  anchorType: z.string(),
  anchorVisitId: z.string().uuid().nullable(),
  generatedByRuleVersionId: z.string().uuid(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const visitScheduleListPageSchema = z.object({
  items: z.array(visitScheduleSchema),
  nextCursor: z.string().nullable().openapi({
    description: 'Pass back as `cursor` to fetch the next page; null when this is the last page.',
  }),
});

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
export function registerVisitScheduleRoutes(doc: DocumentedRouter, service: VisitScheduleService) {
  const controller = createVisitScheduleController(service);

  doc.get(
    '/visit-schedules',
    {
      summary:
        "Cursor-paginated visit-schedule list, scoped by sakhiId — backs FR-SV-4.6's Data " +
        "Restore flow (a Sakhi's device re-downloading everything scoped to her after a " +
        'reset/reinstall). VisitSchedule carries no sakhiId column of its own — the in-scope ' +
        'beneficiaryIds are resolved via beneficiary-service GET /beneficiaries/ids, which ' +
        'applies the same role-scoping GET /visits uses: SAKHI always sees only her own ' +
        'schedules regardless of the sakhiId query param; SUPERVISOR sees one roster sakhiId ' +
        'or, if omitted, her whole roster; MANAGER/ADMIN may pass any sakhiId or omit it for ' +
        'fully unscoped. Excludes soft-deleted rows.',
      tags: ['Visit Schedules'],
      query: listVisitSchedulesQuerySchema,
      responses: {
        200: {
          description: 'Visit schedules retrieved',
          schema: envelope(visitScheduleListPageSchema),
        },
        400: errorResponse(400),
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listVisitSchedulesQuerySchema, 'query'),
    controller.list,
  );

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
    controller.createBulk,
  );

  doc.post(
    '/visit-schedules/generate',
    {
      summary:
        "Compute and persist a beneficiary's visit schedule for one SRS journey " +
        "(ANC/PP/NN/INC/HR/DELIVERY) via rules-service's published GoRules SCHEDULE pack, " +
        'instead of trusting caller-supplied dates (FR-S-2.2A). CCV is not covered here — see ' +
        'ccvOpeningRiskState.resolver.ts. DELIVERY returns a dispatch decision with no schedule ' +
        'rows of its own; the caller issues separate /generate calls for PP/NN/INC per that plan. ' +
        'MANAGER/ADMIN are permitted (not just SAKHI/SUPERVISOR) so risk-referral-service can ' +
        "forward a MANAGER/ADMIN-originated risk assessment's own HR-visit-generation trigger " +
        '(RiskAssessmentService.create -> generateHrVisitSchedule) without a 403 — that call ' +
        "reuses the caller's own Authorization header, whatever role it carries; " +
        'assertCanTouchBeneficiary already treats MANAGER/ADMIN as unrestricted via isPrivileged() ' +
        '(security review finding, 2026-09-02).',
      tags: ['Visit Schedules'],
      responses: {
        201: {
          description: 'Schedule generated (or dispatch decision returned for DELIVERY)',
          schema: envelope(generateResultSchema),
        },
        400: errorResponse(400, {
          message: 'No rule set is configured for the "NN" schedule kind.',
        }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        409: errorResponse(409, {
          message:
            'A schedule for visitCode "ANC3" already exists under a different localScheduleUuid.',
        }),
        502: errorResponse(502, {
          message: 'Unable to evaluate the visit schedule — rules-service is unreachable.',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validateBody(generateVisitScheduleSchema),
    controller.generate,
  );
}
