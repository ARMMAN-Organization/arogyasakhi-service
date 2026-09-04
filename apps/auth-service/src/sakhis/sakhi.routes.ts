import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { SakhiService } from './sakhi.service';
import { createSakhiController } from './sakhi.controller';
import { byIdsQuerySchema } from './dto/by-ids-query.dto';
import {
  authenticate,
  errorResponse,
  requireRoles,
  validate,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const projectIdParamsSchema = z
  .object({
    projectId: z.string().uuid().openapi({ example: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd' }),
  })
  .strict();

// sakhiId is the Sakhi's users.user_id (the JWT sub), not the sakhi_profiles
// row's own PK — see sakhi.service.ts's toApiSakhi() comment.
const sakhiIdParamsSchema = z
  .object({
    sakhiId: z.string().uuid().openapi({ example: 'c9f8e2b1-6a3d-4f0e-9b1a-2d4e5f6a7b8c' }),
  })
  .strict();

const sakhiSchema = z.object({
  sakhiId: z.string().uuid().openapi({ example: 'c9f8e2b1-6a3d-4f0e-9b1a-2d4e5f6a7b8c' }),
  displayName: z.string().openapi({ example: 'Priya Sharma' }),
  mobileNumber: z.string().openapi({ example: '+919000000123' }),
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'PAUSED', 'DELETED']).openapi({
    example: 'ACTIVE',
  }),
  employeeCode: z.string().nullable().openapi({ example: 'EMP-00123' }),
  primaryProjectId: z.string().uuid().openapi({ example: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd' }),
  supervisorId: z.string().uuid().nullable(),
  activeFrom: z.string().datetime().openapi({ example: '2026-04-01T00:00:00.000Z' }),
  activeTo: z.string().datetime().nullable(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Sakhi profile read HTTP routes. Mounted under the global `api/v1` prefix.
 * `listByProject` is restricted to SUPERVISOR/MANAGER/ADMIN — these back the
 * Supervisor's Sakhi picker and detail header (e.g. the Assign/Issue Item
 * screen). `getById` additionally allows SAKHI, but only for their own id
 * (see SakhiService.getById) — needed by the Sakhi dashboard for the
 * caller's own name/profile; a Sakhi still cannot look up another Sakhi.
 */
export function registerSakhiRoutes(
  doc: DocumentedRouter,
  service: SakhiService,
  signer: TokenSigner,
) {
  const controller = createSakhiController(service);

  doc.get(
    '/projects/:projectId/sakhis',
    {
      summary: 'List Sakhis assigned to a project',
      tags: ['Sakhis'],
      params: projectIdParamsSchema,
      responses: {
        200: { description: 'Sakhis under this project', schema: envelope(z.array(sakhiSchema)) },
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(projectIdParamsSchema, 'params'),
    controller.listByProject,
  );

  // Registered before '/sakhis/:sakhiId' — Express matches routes in
  // registration order, so if this came after, the literal 'by-ids' segment
  // would be swallowed by :sakhiId's z.string().uuid() validator and always
  // 400 with "sakhiId: Invalid uuid" for the comma-joined batch value.
  doc.get(
    '/sakhis/by-ids',
    {
      summary:
        "Batch lookup of Sakhi profiles by id, for Quick Response's page-level Sakhi name " +
        'resolution (one call per page instead of one per card). `ids` is a comma-separated ' +
        "list, further intersected server-side with the caller's own project scope " +
        '(SUPERVISOR: own project; MANAGER/ADMIN: unscoped) — an id outside that scope, or ' +
        'simply not found, is absent from the result, not a 404 or 403 (never trust a ' +
        'caller-supplied id list as pre-scoped).',
      tags: ['Sakhis'],
      query: byIdsQuerySchema,
      responses: {
        200: {
          description: 'Matching Sakhis (may be fewer than requested)',
          schema: envelope(z.array(sakhiSchema)),
        },
        400: errorResponse(400, { message: 'ids: String must contain at least 1 character(s)' }),
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(byIdsQuerySchema, 'query'),
    controller.getManyByIds,
  );

  doc.get(
    '/sakhis/:sakhiId',
    {
      summary:
        'Get a Sakhi by id. A SAKHI caller may only fetch their own id (403 otherwise) — ' +
        "used by the Sakhi dashboard for the caller's own name/profile, in addition to this " +
        "route's original Supervisor picker/detail-header use. SYSTEM is included for " +
        "automated cron jobs (e.g. risk-referral-service's overdue-followup escalation) " +
        'resolving a Sakhi via their own service-token identity, not a human session.',
      tags: ['Sakhis'],
      params: sakhiIdParamsSchema,
      responses: {
        200: { description: 'Sakhi detail', schema: envelope(sakhiSchema) },
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Sakhi not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN', 'SYSTEM'),
    validate(sakhiIdParamsSchema, 'params'),
    controller.getById,
  );
}
