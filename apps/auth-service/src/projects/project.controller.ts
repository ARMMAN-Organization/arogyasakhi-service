import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { ProjectService } from './project.service';
import { createFunderSchema } from './dto/create-funder.dto';
import { createProjectSchema } from './dto/create-project.dto';
import { updateProjectSchema } from './dto/update-project.dto';
import {
  asyncHandler,
  authenticate,
  createDocumentedRouter,
  errorResponse,
  ok,
  requireRoles,
  validate,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const idParamsSchema = z
  .object({
    id: z.string().uuid().openapi({ example: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd' }),
  })
  .strict();

const funderSchema = z.object({
  funderId: z.string().uuid().openapi({ example: 'f25ef217-1cfd-4014-bddd-038c8b332a88' }),
  funderCode: z.string().openapi({ example: 'ARMMAN-CSR' }),
  funderName: z.string().openapi({ example: 'ARMMAN CSR Partner' }),
  status: z.enum(['ACTIVE', 'INACTIVE']).openapi({ example: 'ACTIVE' }),
});

const projectSchema = z.object({
  projectId: z.string().uuid().openapi({ example: '70ca545d-298a-4c02-bba2-d5c4c9bb9acd' }),
  funderId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: 'f25ef217-1cfd-4014-bddd-038c8b332a88' }),
  funder: funderSchema.nullable(),
  projectCode: z.string().openapi({ example: 'GEP-2627' }),
  projectName: z.string().openapi({ example: 'GEP 2026-27' }),
  financialYear: z.string().openapi({ example: '2026-27' }),
  startDate: z.string().datetime().openapi({ example: '2026-04-01T00:00:00.000Z' }),
  endDate: z.string().datetime().nullable().openapi({ example: '2027-03-31T00:00:00.000Z' }),
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']).openapi({ example: 'ACTIVE' }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Project/funder master-data HTTP routes. Mounted under the global `api/v1`
 * prefix. Reads are open to any authenticated role (project pickers/dropdowns
 * are needed everywhere); writes are ADMIN-only per the SRS's ownership of
 * funder/project master data.
 */
export function createProjectRouter(service: ProjectService, signer: TokenSigner) {
  const doc = createDocumentedRouter();

  doc.get(
    '/projects',
    {
      summary: 'List active projects',
      tags: ['Projects'],
      responses: {
        200: { description: 'Active projects', schema: envelope(z.array(projectSchema)) },
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.get(
    '/projects/:id',
    {
      summary: 'Get a project by id',
      tags: ['Projects'],
      params: idParamsSchema,
      responses: {
        200: { description: 'Project detail', schema: envelope(projectSchema) },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Project not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(idParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
    }),
  );

  doc.post(
    '/projects',
    {
      summary: 'Create a project',
      tags: ['Projects'],
      responses: {
        201: { description: 'Project created', schema: envelope(projectSchema) },
        400: errorResponse(400, { message: 'projectCode: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        409: errorResponse(409, {
          message: 'A project with this project code already exists.',
          description: 'Conflict — a project with this project code already exists',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validateBody(createProjectSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  doc.patch(
    '/projects/:id',
    {
      summary: 'Update a project',
      tags: ['Projects'],
      params: idParamsSchema,
      responses: {
        200: { description: 'Project updated', schema: envelope(projectSchema) },
        400: errorResponse(400, { message: 'status: Invalid enum value.' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Project not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(idParamsSchema, 'params'),
    validateBody(updateProjectSchema),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.update(req.params.id, req.body)));
    }),
  );

  doc.get(
    '/funders',
    {
      summary: 'List active funders',
      tags: ['Projects'],
      responses: {
        200: { description: 'Active funders', schema: envelope(z.array(funderSchema)) },
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listFunders()));
    }),
  );

  doc.post(
    '/funders',
    {
      summary: 'Create a funder',
      tags: ['Projects'],
      responses: {
        201: { description: 'Funder created', schema: envelope(funderSchema) },
        400: errorResponse(400, { message: 'funderCode: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        409: errorResponse(409, {
          message: 'A funder with this funder code already exists.',
          description: 'Conflict — a funder with this funder code already exists',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validateBody(createFunderSchema),
    asyncHandler(async (req, res) => {
      const created = await service.createFunder(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
