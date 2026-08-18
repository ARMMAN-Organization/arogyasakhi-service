import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { VisitInstanceService } from './visitInstance.service';
import { createVisitInstanceController } from './visitInstance.controller';
import { createVisitInstanceSchema } from './dto/create-visitInstance.dto';
import { updateVisitInstanceSchema } from './dto/update-visitInstance.dto';
import { visitSummaryQuerySchema } from './dto/visit-summary-query.dto';
import { countByBeneficiarySchema } from './dto/count-by-beneficiary.dto';
import { byPadaSchema } from './dto/by-pada.dto';
import {
  errorResponse,
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const idParamsSchema = z.object({ id: z.string().uuid() }).strict();
const beneficiaryIdParamsSchema = z.object({ beneficiaryId: z.string().uuid() }).strict();

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const createVisitInstanceRequestSchema = createVisitInstanceSchema.extend({
  scheduleId: createVisitInstanceSchema.shape.scheduleId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  beneficiaryId: createVisitInstanceSchema.shape.beneficiaryId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  sakhiId: createVisitInstanceSchema.shape.sakhiId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  localVisitUuid: createVisitInstanceSchema.shape.localVisitUuid.openapi({
    example: 'device-abc-visit-001',
  }),
  statusLookupValueId: createVisitInstanceSchema.shape.statusLookupValueId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
});

const visitInstanceSchema = z.object({
  id: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  scheduleId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  beneficiaryId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  sakhiId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  localVisitUuid: z.string().openapi({ example: 'device-abc-visit-001' }),
  actualVisitDate: z
    .string()
    .datetime()
    .nullable()
    .openapi({ example: '2026-07-20T00:00:00.000Z' }),
  // Nullable until backfill-visit-status-lookup.ts has run in every env: the
  // underlying column (schema.prisma) is String? for the transition window, so
  // GET /visits can return null for legacy rows. Documenting it as non-null
  // would mislead clients that trust this schema. Tighten to non-null in a
  // follow-up once backfill is confirmed complete everywhere.
  statusLookupValueId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  meetBeneficiaryFlag: z.boolean().nullable().openapi({ example: true }),
  notMetReason: z.string().nullable().openapi({ example: null }),
  completedAt: z.string().datetime().nullable().openapi({ example: '2026-07-20T10:15:00.000Z' }),
  syncedAt: z.string().datetime().nullable().openapi({ example: null }),
  createdAt: z.string().datetime().openapi({ example: '2026-07-20T10:15:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-07-20T10:15:00.000Z' }),
});

const visitSummarySchema = z.object({
  total: z.number().int(),
  byStatus: z.record(z.string(), z.number().int()),
  endingSoonVisitsCount: z.number().int(),
});

const countByBeneficiaryResponseSchema = z.record(
  z.string(),
  z.object({
    dueVisitsCount: z.number().int(),
    overdueVisitsCount: z.number().int(),
    dueTodayCount: z.number().int(),
  }),
);

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Visit instance HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema is
 * inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function registerVisitInstanceRoutes(doc: DocumentedRouter, service: VisitInstanceService) {
  const controller = createVisitInstanceController(service);

  doc.get(
    '/visits',
    {
      summary: 'List recent visit instances',
      tags: ['Visits'],
      responses: {
        200: { description: 'Visit instances', schema: envelope(z.array(visitInstanceSchema)) },
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    controller.list,
  );

  doc.get(
    '/visits/visit-summary',
    {
      summary:
        'Visit Summary widget — counts of in-scope visits grouped by status, filtered by ' +
        'VisitSchedule.scheduledDate (when due, not when it happened), plus ' +
        'endingSoonVisitsCount: a sub-count of due/overdue visits whose window closes within ' +
        '3 days. Same role-scoping as PATCH /visits/:id: SAKHI sees own visits, SUPERVISOR ' +
        'sees roster visits, MANAGER/ADMIN unscoped.',
      tags: ['Visits'],
      responses: {
        200: { description: 'Visit status counts', schema: envelope(visitSummarySchema) },
        400: errorResponse(400, { message: 'fromDate must be on or before toDate.' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(visitSummaryQuerySchema, 'query'),
    controller.getVisitSummary,
  );

  doc.get(
    '/beneficiaries/:beneficiaryId/visits',
    {
      summary:
        "A beneficiary's full visit history (Beneficiary Data Download screen — offline " +
        'reference, so this returns every visit instance for the beneficiary, not just the ' +
        'recent ones GET /visits lists). Same fields as GET /visits, filtered to one ' +
        'beneficiary and ordered by actualVisitDate desc (nulls last).',
      tags: ['Visits'],
      params: beneficiaryIdParamsSchema,
      responses: {
        200: {
          description: 'Visit instances for this beneficiary',
          schema: envelope(z.array(visitInstanceSchema)),
        },
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(beneficiaryIdParamsSchema, 'params'),
    controller.listByBeneficiary,
  );

  doc.post(
    '/visits/count-by-beneficiary',
    {
      summary:
        'Due/overdue visit counts per beneficiaryId, for the Pada Breakdown widget — the ' +
        "caller (api-gateway) sums these per pada using beneficiary-service's own " +
        'beneficiaryId -> padaId grouping. `beneficiaryIds` is intersected server-side with ' +
        "the caller's own scope (SAKHI: own; SUPERVISOR: roster; MANAGER/ADMIN: unscoped) — " +
        'never trusted as pre-scoped; an out-of-scope id is silently excluded from the ' +
        'result. Internal use only, not part of the public API surface.',
      tags: ['Visits'],
      responses: {
        200: {
          description: 'Due/overdue counts keyed by beneficiaryId',
          schema: envelope(countByBeneficiaryResponseSchema),
        },
        400: errorResponse(400, { message: 'beneficiaryIds.0: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validateBody(countByBeneficiarySchema),
    controller.getCountByBeneficiary,
  );

  doc.post(
    '/visits/by-pada',
    {
      summary:
        "Full visit cards (visitId, visitType, dueDate) for the Pada visit-list screen's " +
        '"open" tab — due (PENDING) or overdue (MISSED) visits scheduled on `date` for the ' +
        "given beneficiaryIds, intersected server-side with the caller's own scope (SAKHI: " +
        'own; SUPERVISOR: roster; MANAGER/ADMIN: unscoped) — never trusted as pre-scoped. ' +
        'Internal use only, not part of the public API surface.',
      tags: ['Visits'],
      responses: {
        200: {
          description: 'Visit cards due/overdue on the given date',
          schema: envelope(
            z.array(
              z.object({
                visitId: z.string().uuid(),
                beneficiaryId: z.string().uuid(),
                visitType: z.string().openapi({ example: 'ANC 3' }),
                dueDate: z.string().openapi({ example: '2026-08-20' }),
              }),
            ),
          ),
        },
        400: errorResponse(400, { message: 'date: must be a date-only string (YYYY-MM-DD)' }),
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validateBody(byPadaSchema),
    controller.getByPada,
  );

  doc.post(
    '/visits',
    {
      summary: 'Create a visit instance',
      tags: ['Visits'],
      responses: {
        201: { description: 'Visit instance created', schema: envelope(visitInstanceSchema) },
        400: errorResponse(400, { message: 'beneficiaryId: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        422: errorResponse(422, {
          message: 'scheduleId does not reference an existing visit schedule.',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createVisitInstanceRequestSchema),
    controller.create,
  );

  doc.patch(
    '/visits/:id',
    {
      summary:
        "Update a visit instance's status (e.g. to COMPLETED/MISSED). A SAKHI may only " +
        'update her own visit; a SUPERVISOR only a visit whose Sakhi is assigned to her; ' +
        'MANAGER/ADMIN unrestricted. completedAt is set automatically when the new status ' +
        'resolves to COMPLETED, left null otherwise.',
      tags: ['Visits'],
      params: idParamsSchema,
      responses: {
        200: { description: 'Visit instance updated', schema: envelope(visitInstanceSchema) },
        400: errorResponse(400, { message: 'statusLookupValueId: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'You do not have access to this visit.' }),
        404: errorResponse(404, { message: 'Visit instance not found.' }),
        409: errorResponse(409, { message: 'This visit is already COMPLETED.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idParamsSchema, 'params'),
    validateBody(updateVisitInstanceSchema),
    controller.updateStatus,
  );
}
