import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { VisitInstanceService } from './visitInstance.service';
import { createVisitInstanceController } from './visitInstance.controller';
import { createVisitInstanceSchema } from './dto/create-visitInstance.dto';
import { updateVisitInstanceSchema } from './dto/update-visitInstance.dto';
import { visitSummaryQuerySchema } from './dto/visit-summary-query.dto';
import { countByBeneficiarySchema } from './dto/count-by-beneficiary.dto';
import { byPadaSchema } from './dto/by-pada.dto';
import { visitHistoryQuerySchema } from './dto/visit-history-query.dto';
import { restoreForSakhiSchema } from './dto/restore-for-sakhi.dto';
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

const visitHistoryVitalsSchema = z.object({
  hemoglobin: z.object({
    value: z.string().nullable().openapi({ example: '9.4' }),
    unit: z.literal('g/dl'),
  }),
  bloodPressure: z.object({
    systolic: z.number().int().nullable().openapi({ example: 120 }),
    diastolic: z.number().int().nullable().openapi({ example: 80 }),
    unit: z.literal('mmHg'),
  }),
  weight: z.object({
    value: z.string().nullable().openapi({ example: '60.2' }),
    unit: z.literal('kg'),
  }),
  bloodSugar: z.object({
    value: z.string().nullable().openapi({ example: null }),
    unit: z.literal('mg/dl'),
  }),
  temperature: z.object({
    value: z.string().nullable().openapi({ example: null }),
    unit: z.literal('°F'),
  }),
});

const visitHistoryResponseSchema = z.object({
  visits: z.array(
    z.object({
      visitId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
      visitCode: z.string().openapi({ example: 'ANC2' }),
      completedAt: z.string().datetime().openapi({ example: '2026-08-04T10:12:00.000Z' }),
      vitals: visitHistoryVitalsSchema,
    }),
  ),
});

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

  doc.get(
    '/beneficiaries/:beneficiaryId/visit-history',
    {
      summary:
        "A beneficiary's last completed visits' key vitals (Hemoglobin, Blood Pressure, " +
        'Weight, Blood Sugar, Temperature) — FR-S-4.6, shown to a Sakhi before she starts the ' +
        "beneficiary's next visit. Filtered to COMPLETED visits only, newest first. A vital " +
        "not captured by a given visit's form (e.g. no BP question on a PP visit) is null, " +
        'never omitted, so the response shape never depends on which visit type was most ' +
        'recent. Same ownership scoping as GET /beneficiaries/:beneficiaryId/latest-visit-vitals: ' +
        'SAKHI must own the beneficiary case herself, SUPERVISOR only via her own roster, ' +
        'MANAGER/ADMIN unrestricted.',
      tags: ['Visits'],
      params: beneficiaryIdParamsSchema,
      query: visitHistoryQuerySchema,
      responses: {
        200: {
          description: "Beneficiary's completed visit history with vitals",
          schema: envelope(visitHistoryResponseSchema),
        },
        400: errorResponse(400, { message: 'limit: Number must be greater than or equal to 1' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'This beneficiary case is outside your own roster.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(beneficiaryIdParamsSchema, 'params'),
    validate(visitHistoryQuerySchema, 'query'),
    controller.getVisitHistory,
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

  // Registered before '/visits/:id' — Express matches routes in
  // registration order, so if this came after, the literal 'restore'
  // segment would be swallowed by :id's z.string().uuid() validator and
  // 400 with "id: Invalid uuid" (the exact bug this ordering avoids).
  doc.patch(
    '/visits/restore',
    {
      summary:
        'Restore every visit/form record previously soft-deleted for one Sakhi — ' +
        "called by approval-service's own DATA_RESTORE decide path, forwarding the " +
        "deciding Supervisor's Authorization header — SYSTEM/ADMIN also allowed for a " +
        'future direct/service-token caller. ' +
        'Undoes isDeleted/deletedAt across VisitInstance, VisitSchedule, ' +
        'VisitStatusHistory, FormSubmission, and FormAnswer. VisitMaster/FormDefinition/' +
        'FormVersion are global reference data and are intentionally excluded — they have ' +
        'no per-Sakhi scope. A no-op (200, restoredVisitCount: 0) if the Sakhi has nothing ' +
        'currently soft-deleted.',
      tags: ['Visits'],
      body: restoreForSakhiSchema,
      responses: {
        200: {
          description: 'Restore applied (or a no-op if nothing was soft-deleted)',
          schema: envelope(z.object({ restoredVisitCount: z.number().int().nonnegative() })),
        },
        400: errorResponse(400, { message: 'sakhiUserId: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'SYSTEM', 'ADMIN'),
    validateBody(restoreForSakhiSchema),
    controller.restoreForSakhi,
  );

  doc.get(
    '/visits/:id',
    {
      summary:
        "A single visit instance's detail — internal use only, not part of the public " +
        'Visits API surface (the app has no single-visit-read flow; only list/summary/' +
        'PATCH). Added for Quick Response card-enrichment.',
      tags: ['Visits'],
      params: idParamsSchema,
      responses: {
        200: { description: 'Visit instance detail', schema: envelope(visitInstanceSchema) },
        400: errorResponse(400),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Visit instance not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(idParamsSchema, 'params'),
    controller.getById,
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
