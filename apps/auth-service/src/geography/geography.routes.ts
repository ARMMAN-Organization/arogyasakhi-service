import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { GeographyService } from './geography.service';
import { createGeographyController } from './geography.controller';
import {
  authenticate,
  errorResponse,
  requireRoles,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';
import { createGeographyUnitSchema } from './dto/create-geography-unit.dto';
import { updateGeographyUnitSchema } from './dto/update-geography-unit.dto';
import { byIdsQuerySchema } from './dto/by-ids-query.dto';

extendZodWithOpenApi(z);

const geographyUnitIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }) })
  .strict();

const listGeographyUnitsQuerySchema = z
  .object({
    geoType: z
      .enum(['STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA'])
      .optional()
      .openapi({ example: 'DISTRICT' }),
    parentId: z
      .string()
      .uuid()
      .optional()
      .openapi({ example: '99999999-9999-9999-9999-999999999999' }),
  })
  .strict();

const geographyUnitSchema = z.object({
  geographyUnitId: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }),
  parentId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
  geoType: z
    .enum(['STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA'])
    .openapi({ example: 'PHC' }),
  geoCode: z.string().nullable().openapi({ example: 'PHC-001' }),
  name: z.string().openapi({ example: 'Sample PHC' }),
  status: z.enum(['ACTIVE', 'INACTIVE']).openapi({ example: 'ACTIVE' }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Geography unit master-data HTTP routes (State/District/Block/PHC/Sub-centre/
 * Village/Pada — SRS's 7-level hierarchy). Mounted under the global `api/v1`
 * prefix. Read-only for now: no service owns writes to geography master data
 * yet outside seeding. Open to any authenticated role, same as /lookups —
 * other services (e.g. beneficiary-service resolving a PHC's parent Health
 * Block) call this through the gateway using the original caller's token.
 */
export function registerGeographyRoutes(
  doc: DocumentedRouter,
  service: GeographyService,
  signer: TokenSigner,
) {
  const controller = createGeographyController(service);

  // Registered above `/geography-units/:id` for readability (list before
  // single-item reads); ordering isn't load-bearing here since Express
  // matches by path segment count and `/geography-units` (2 segments) can
  // never collide with `/geography-units/:id` (3 segments) — unlike
  // `/geography-units/roots` vs `/:id` below, which are both 3 segments and
  // do genuinely need the ordering.
  doc.get(
    '/geography-units',
    {
      summary: 'List geography units for cascading selection (filter by geoType and/or parentId)',
      tags: ['Geography'],
      query: listGeographyUnitsQuerySchema,
      responses: {
        200: {
          description:
            'Geography units matching the filters. With no filter, returns top-level units (STATEs).',
          schema: envelope(z.array(geographyUnitSchema)),
        },
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(listGeographyUnitsQuerySchema, 'query'),
    controller.list,
  );

  // Registered before `/geography-units/:id` — Express matches routes in
  // registration order, and `:id` would otherwise capture the literal
  // "roots" segment as an id value.
  doc.get(
    '/geography-units/roots',
    {
      summary: 'List all top-level geography units (STATEs — no parent)',
      tags: ['Geography'],
      responses: {
        200: { description: 'Top-level units', schema: envelope(z.array(geographyUnitSchema)) },
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    controller.getRoots,
  );

  // Registered before `/geography-units/:id` — Express matches routes in
  // registration order, and `:id` would otherwise capture the literal
  // "by-ids" segment as an id value and fail UUID validation, same reasoning
  // as `/geography-units/roots` above.
  doc.get(
    '/geography-units/by-ids',
    {
      summary:
        'Batch-get geography units by id — used by other services (e.g. ' +
        "approval-service's Quick Response card-detail list, resolving each " +
        "card's Pada) for page-level name resolution instead of one call per " +
        'unit. Open to any authenticated role, same as GET /geography-units/:id. ' +
        'An unknown or soft-deleted id is silently absent from the result ' +
        'rather than erroring.',
      tags: ['Geography'],
      query: byIdsQuerySchema,
      responses: {
        200: {
          description: 'Geography units found (unknown ids silently omitted)',
          schema: envelope(z.array(geographyUnitSchema)),
        },
        400: errorResponse(400, {
          message: 'ids: must be a comma-separated list of at most 100 uuids',
        }),
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(byIdsQuerySchema, 'query'),
    controller.getByIds,
  );

  doc.get(
    '/geography-units/:id',
    {
      summary: 'Get one geography unit by id',
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: { description: 'Geography unit', schema: envelope(geographyUnitSchema) },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(geographyUnitIdParamsSchema, 'params'),
    controller.getById,
  );

  doc.get(
    '/geography-units/:id/ancestors',
    {
      summary: "Get one geography unit's full ancestor chain, up to STATE",
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: {
          description: 'Ancestor chain, ordered from the requested unit up to STATE',
          schema: envelope(z.array(geographyUnitSchema)),
        },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(geographyUnitIdParamsSchema, 'params'),
    controller.getAncestors,
  );

  doc.get(
    '/geography-units/:id/children',
    {
      summary: 'List the direct children of a geography unit',
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: {
          description: 'Direct children of the requested unit (empty array if it is a leaf)',
          schema: envelope(z.array(geographyUnitSchema)),
        },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(geographyUnitIdParamsSchema, 'params'),
    controller.getChildren,
  );

  doc.post(
    '/geography-units',
    {
      summary: 'Create a geography unit (ADMIN only)',
      tags: ['Geography'],
      responses: {
        201: { description: 'Geography unit created', schema: envelope(geographyUnitSchema) },
        400: errorResponse(400, {
          message: "geoType: Must be exactly one level below the parent's geoType (STATE).",
        }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Parent geography unit not found.' }),
        409: errorResponse(409, {
          message: 'A geography unit with this parent, geoType, and geoCode already exists.',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validateBody(createGeographyUnitSchema),
    controller.create,
  );

  doc.patch(
    '/geography-units/:id',
    {
      summary: 'Update a geography unit (name/geoCode/status only, ADMIN only)',
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: { description: 'Geography unit updated', schema: envelope(geographyUnitSchema) },
        400: errorResponse(400, { message: 'At least one field must be provided.' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        409: errorResponse(409, {
          message: 'A geography unit with this parent, geoType, and geoCode already exists.',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(geographyUnitIdParamsSchema, 'params'),
    validateBody(updateGeographyUnitSchema),
    controller.update,
  );

  doc.delete(
    '/geography-units/:id',
    {
      summary: 'Soft-delete a geography unit (ADMIN only; blocked if it has active children)',
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: {
          description: 'Geography unit deleted',
          schema: envelope(z.object({ deleted: z.literal(true) })),
        },
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        409: errorResponse(409, {
          message: 'Cannot delete a geography unit that has active child units.',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(geographyUnitIdParamsSchema, 'params'),
    controller.remove,
  );
}
