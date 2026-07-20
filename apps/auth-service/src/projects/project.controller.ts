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
  ok,
  requireRoles,
  validate,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const idParamsSchema = z.object({ id: z.string().uuid() }).strict();

const funderSchema = z.object({
  funderId: z.string().uuid(),
  funderCode: z.string(),
  funderName: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

const projectSchema = z.object({
  projectId: z.string().uuid(),
  funderId: z.string().uuid().nullable(),
  funder: funderSchema.nullable(),
  projectCode: z.string(),
  projectName: z.string(),
  financialYear: z.string(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().nullable(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']),
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
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
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
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        404: { description: 'Project not found', schema: apiErrorSchema },
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
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        409: { description: 'Duplicate project code', schema: apiErrorSchema },
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
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Project not found', schema: apiErrorSchema },
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
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
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
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        409: { description: 'Duplicate funder code', schema: apiErrorSchema },
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
