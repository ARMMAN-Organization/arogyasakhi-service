import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { SakhiService } from './sakhi.service';
import {
  asyncHandler,
  authenticate,
  createDocumentedRouter,
  errorResponse,
  ok,
  requireRoles,
  unauthorized,
  validate,
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
 * Restricted to SUPERVISOR/MANAGER/ADMIN — a Sakhi does not look up other
 * Sakhis; these endpoints back the Supervisor's Sakhi picker and detail
 * header (e.g. the Assign/Issue Item screen).
 */
export function createSakhiRouter(service: SakhiService, signer: TokenSigner) {
  const doc = createDocumentedRouter();

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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.listByProject(req.params.projectId, req.user)));
    }),
  );

  doc.get(
    '/sakhis/:sakhiId',
    {
      summary: 'Get a Sakhi by id',
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
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sakhiIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getById(req.params.sakhiId, req.user)));
    }),
  );

  return doc;
}
