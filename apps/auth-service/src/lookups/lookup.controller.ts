import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { LookupService } from './lookup.service';
import { createLookupValueSchema } from './dto/create-lookup-value.dto';
import { updateLookupValueSchema } from './dto/update-lookup-value.dto';
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

const categoryCodeParamsSchema = z.object({ categoryCode: z.string().trim().min(1) }).strict();
const valueIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

const lookupValueSchema = z.object({
  id: z.string().uuid(),
  valueCode: z.string(),
  valueLabel: z.string(),
  sortOrder: z.number(),
  parentLookupValueId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

const lookupCategorySchema = z.object({
  id: z.string().uuid(),
  categoryCode: z.string(),
  categoryName: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  values: z.array(lookupValueSchema),
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
 * Lookup category/value master-data HTTP routes. Mounted under the global
 * `api/v1` prefix. Reads are open to any authenticated role (dropdown
 * options are needed everywhere, and this is what the sync-delta pull uses
 * for offline master data); writes are ADMIN-only.
 */
export function createLookupRouter(service: LookupService, signer: TokenSigner) {
  const doc = createDocumentedRouter();

  doc.get(
    '/lookups',
    {
      summary: 'List every active lookup category with its values',
      tags: ['Lookups'],
      responses: {
        200: {
          description: 'All lookup categories with values',
          schema: envelope(z.array(lookupCategorySchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    authenticate(signer),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.listAll()));
    }),
  );

  doc.get(
    '/lookups/:categoryCode',
    {
      summary: 'Get one lookup category with its values',
      tags: ['Lookups'],
      params: categoryCodeParamsSchema,
      responses: {
        200: { description: 'Lookup category with values', schema: envelope(lookupCategorySchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        404: { description: 'Lookup category not found', schema: apiErrorSchema },
      },
    },
    authenticate(signer),
    validate(categoryCodeParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getByCategoryCode(req.params.categoryCode)));
    }),
  );

  doc.post(
    '/lookups/:categoryCode/values',
    {
      summary: 'Add a value to a lookup category',
      tags: ['Lookups'],
      params: categoryCodeParamsSchema,
      responses: {
        201: { description: 'Lookup value created', schema: envelope(lookupValueSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Lookup category not found', schema: apiErrorSchema },
        409: { description: 'Duplicate value code in this category', schema: apiErrorSchema },
        422: {
          description: 'parentLookupValueId belongs to a different category',
          schema: apiErrorSchema,
        },
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(categoryCodeParamsSchema, 'params'),
    validateBody(createLookupValueSchema),
    asyncHandler(async (req, res) => {
      const created = await service.createValue(req.params.categoryCode, req.body);
      res.status(201).json(ok(created));
    }),
  );

  doc.patch(
    '/lookups/values/:id',
    {
      summary: 'Update a lookup value',
      tags: ['Lookups'],
      params: valueIdParamsSchema,
      responses: {
        200: { description: 'Lookup value updated', schema: envelope(lookupValueSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Lookup value not found', schema: apiErrorSchema },
        422: {
          description: 'parentLookupValueId belongs to a different category',
          schema: apiErrorSchema,
        },
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(valueIdParamsSchema, 'params'),
    validateBody(updateLookupValueSchema),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.updateValue(req.params.id, req.body)));
    }),
  );

  return doc;
}
