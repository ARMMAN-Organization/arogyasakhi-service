import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { LookupService } from './lookup.service';
import { createLookupValueSchema } from './dto/create-lookup-value.dto';
import { updateLookupValueSchema } from './dto/update-lookup-value.dto';
import { bulkUpsertLookupValuesSchema } from './dto/bulk-upsert-lookup-values.dto';
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

const categoryCodeParamsSchema = z
  .object({ categoryCode: z.string().trim().min(1).openapi({ example: 'RISK_GRADE' }) })
  .strict();
const valueIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '3eb3104f-3596-418f-8ccd-2e95323e14ba' }) })
  .strict();

const lookupValueSchema = z.object({
  id: z.string().uuid().openapi({ example: '3eb3104f-3596-418f-8ccd-2e95323e14ba' }),
  valueCode: z.string().openapi({ example: 'HIGH' }),
  valueLabel: z.string().openapi({ example: 'High' }),
  sortOrder: z.number().openapi({ example: 0 }),
  parentLookupValueId: z.string().uuid().nullable().openapi({ example: null }),
  isActive: z.boolean().openapi({ example: true }),
});

const lookupCategorySchema = z.object({
  id: z.string().uuid().openapi({ example: 'e23ecb9f-1bc5-493e-87a6-9a2960e3cd1c' }),
  categoryCode: z.string().openapi({ example: 'RISK_GRADE' }),
  categoryName: z.string().openapi({ example: 'Risk Grade' }),
  description: z
    .string()
    .nullable()
    .openapi({ example: 'Risk grading scale for beneficiary cases.' }),
  isActive: z.boolean().openapi({ example: true }),
  values: z.array(lookupValueSchema),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

const bulkUpsertResultSchema = z.object({
  created: z.array(z.string()).openapi({ example: ['TENTH_PASS'] }),
  updated: z.array(z.string()).openapi({ example: ['PRIMARY'] }),
  unchanged: z.array(z.string()).openapi({ example: ['GRADUATE'] }),
});

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
        401: errorResponse(401),
        500: errorResponse(500),
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
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Lookup category not found.' }),
        500: errorResponse(500),
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
        400: errorResponse(400, { message: 'valueCode: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Lookup category not found.' }),
        409: errorResponse(409, {
          message: 'A value with this code already exists in this category.',
          description: 'Conflict — duplicate value code in this category',
        }),
        422: errorResponse(422, {
          message: 'parentLookupValueId must belong to the same lookup category.',
          description: 'Unprocessable — parentLookupValueId belongs to a different category',
        }),
        500: errorResponse(500),
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
        400: errorResponse(400, { message: 'sortOrder: Expected number, received string' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Lookup value not found.' }),
        422: errorResponse(422, {
          message: 'parentLookupValueId must belong to the same lookup category.',
          description: 'Unprocessable — parentLookupValueId belongs to a different category',
        }),
        500: errorResponse(500),
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

  doc.patch(
    '/lookups/:categoryCode/values/bulk-upsert',
    {
      summary: "Reconcile a category's values against a target list",
      tags: ['Lookups'],
      params: categoryCodeParamsSchema,
      responses: {
        200: {
          description: 'Values created/updated as needed; a summary of what changed',
          schema: envelope(bulkUpsertResultSchema),
        },
        400: errorResponse(400, { message: 'values: Array must contain at least 1 element(s)' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Lookup category not found.' }),
        422: errorResponse(422, {
          message: 'parentLookupValueId must belong to the same lookup category.',
          description: 'Unprocessable — parentLookupValueId belongs to a different category',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(categoryCodeParamsSchema, 'params'),
    validateBody(bulkUpsertLookupValuesSchema),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.bulkUpsertValues(req.params.categoryCode, req.body)));
    }),
  );

  return doc;
}
