import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { OperationsService } from './operations.service';
import { createInventoryController } from './inventory.controller';
import { createInventoryItemSchema } from './dto/create-inventory-item.dto';
import { createInventoryTransactionSchema } from './dto/create-inventory-transaction.dto';
import { updateInventoryTransactionSchema } from './dto/update-inventory-transaction.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  itemCode: z.string(),
  itemName: z.string(),
  itemCategory: z.enum(['CONSUMABLE', 'INSTRUMENT']),
  unit: z.string(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const inventoryTransactionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  supervisorId: z.string().uuid(),
  sakhiId: z.string().uuid(),
  itemId: z.string().uuid(),
  transactionType: z.enum(['HANDOVER', 'RETURNED', 'PERMANENT_DAMAGED', 'MISPLACED', 'CONSUMED']),
  quantity: z.number().int(),
  transactionDate: z.string().datetime(),
  remarks: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const sakhiIdParamsSchema = z
  .object({
    sakhiId: z.string().uuid(),
  })
  .strict();

const transactionIdParamsSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();

const createInventoryTransactionRequestSchema = createInventoryTransactionSchema;

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
 * Inventory item/transaction HTTP routes. Mounted under the global `api/v1`
 * prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined in the
 * same call as the Express route — the spec can never drift from what's mounted.
 */
export function registerInventoryRoutes(doc: DocumentedRouter, service: OperationsService) {
  const controller = createInventoryController(service);

  doc.get(
    '/inventory-items',
    {
      summary: 'List inventory items (consumables/instruments master data)',
      tags: ['Supervisor Operations'],
      responses: {
        200: { description: 'Inventory items', schema: envelope(z.array(inventoryItemSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    controller.listItems,
  );

  // Alias for consumers that expect a dedicated "Item Master List" path
  // rather than /inventory-items — same handler, same response, same role
  // restriction, just a different URL.
  doc.get(
    '/item-master-list',
    {
      summary: 'Download all Item Master rows (alias for GET /inventory-items)',
      tags: ['Supervisor Operations'],
      responses: {
        200: { description: 'Inventory items', schema: envelope(z.array(inventoryItemSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    controller.listItems,
  );

  doc.post(
    '/inventory-items',
    {
      summary: 'Create an inventory item (consumables/instruments master data)',
      tags: ['Supervisor Operations'],
      responses: {
        201: { description: 'Inventory item created', schema: envelope(inventoryItemSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        409: { description: 'itemCode already exists', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validateBody(createInventoryItemSchema),
    controller.createItem,
  );

  doc.get(
    '/inventory-transactions',
    {
      summary: 'List recent inventory transactions',
      tags: ['Supervisor Operations'],
      responses: {
        200: {
          description: 'Inventory transactions',
          schema: envelope(z.array(inventoryTransactionSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    controller.listTransactions,
  );

  doc.get(
    '/inventory-transactions/by-sakhi/:sakhiId',
    {
      summary: "One Sakhi's inventory transaction history",
      tags: ['Supervisor Operations'],
      params: sakhiIdParamsSchema,
      responses: {
        200: {
          description: 'Inventory transactions for this Sakhi',
          schema: envelope(z.array(inventoryTransactionSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(sakhiIdParamsSchema, 'params'),
    controller.listTransactionsBySakhi,
  );

  doc.post(
    '/inventory-transactions',
    {
      summary: 'Record an inventory transaction (one or more items)',
      tags: ['Supervisor Operations'],
      responses: {
        201: {
          description: 'Inventory transaction(s) created',
          schema: envelope(z.array(inventoryTransactionSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        422: { description: 'Referenced item not found or inactive', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validateBody(createInventoryTransactionRequestSchema),
    controller.createTransactions,
  );

  doc.get(
    '/inventory-transactions/:id',
    {
      summary: 'Fetch a single inventory transaction by id',
      tags: ['Supervisor Operations'],
      params: transactionIdParamsSchema,
      responses: {
        200: { description: 'Inventory transaction', schema: envelope(inventoryTransactionSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this transaction', schema: apiErrorSchema },
        404: { description: 'Transaction not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(transactionIdParamsSchema, 'params'),
    controller.getTransactionById,
  );

  // Dedicated-path alias for GET /inventory-transactions/:id — same handler,
  // same response — for the Beneficiary Data Download screen's "Item
  // Transaction Detail" row, which expects this path specifically.
  doc.get(
    '/item-transactions/:id/details',
    {
      summary:
        'Fetch a single inventory transaction by id (alias for GET /inventory-transactions/:id)',
      tags: ['Supervisor Operations'],
      params: transactionIdParamsSchema,
      responses: {
        200: { description: 'Inventory transaction', schema: envelope(inventoryTransactionSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller does not own this transaction', schema: apiErrorSchema },
        404: { description: 'Transaction not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(transactionIdParamsSchema, 'params'),
    controller.getTransactionById,
  );

  doc.put(
    '/inventory-transactions/:id',
    {
      summary: "Edit a transaction's quantity/date/remarks",
      tags: ['Supervisor Operations'],
      params: transactionIdParamsSchema,
      responses: {
        200: { description: 'Transaction updated', schema: envelope(inventoryTransactionSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Transaction not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(transactionIdParamsSchema, 'params'),
    validateBody(updateInventoryTransactionSchema),
    controller.updateTransaction,
  );

  doc.delete(
    '/inventory-transactions/:id',
    {
      summary: 'Delete an inventory transaction (soft delete)',
      tags: ['Supervisor Operations'],
      params: transactionIdParamsSchema,
      responses: {
        200: {
          description: 'Transaction deleted',
          schema: envelope(z.object({ deleted: z.literal(true) })),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Transaction not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'ADMIN'),
    validate(transactionIdParamsSchema, 'params'),
    controller.deleteTransaction,
  );
}
