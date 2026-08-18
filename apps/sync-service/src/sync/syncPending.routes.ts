import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { SyncPendingService } from './syncPending.service';
import { createSyncPendingController } from './syncPending.controller';
import { syncPendingQuerySchema } from './dto/sync-pending-query.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

// Query DTO annotated with an example for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const syncPendingQueryRequestSchema = syncPendingQuerySchema.extend({
  userId: syncPendingQuerySchema.shape.userId.openapi({
    example: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    description: "Omit to default to the authenticated caller's own id.",
  }),
});

const syncPendingItemSchema = z.object({
  id: z.string().uuid(),
  syncBatchId: z.string().uuid(),
  localEntityUuid: z.string().openapi({ example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }),
  entityType: z.string().openapi({ example: 'BENEFICIARY_CASE' }),
  entityId: z.string().uuid().nullable(),
  operation: z.enum(['CREATE', 'UPDATE', 'DELETE', 'UPSERT']).openapi({ example: 'UPSERT' }),
  status: z.enum(['QUEUED', 'FAILED', 'SKIPPED']).openapi({
    example: 'QUEUED',
    description: 'Never SUCCESS — this endpoint only returns outstanding items.',
  }),
  errorCode: z.string().nullable(),
  retryCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  deviceId: z.string().uuid().openapi({ description: "The parent sync batch's deviceId." }),
  startedAt: z.string().datetime().openapi({ description: "The parent sync batch's startedAt." }),
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
 * Sync-pending HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Registers onto the same `doc` (DocumentedRouter/registry) that
 * `syncBatch.routes.ts` uses — see `syncBatch.module.ts` for why one shared
 * registry per service matters: it's what keeps `/docs.json` complete
 * instead of only covering whichever module built the registry.
 */
export function registerSyncPendingRoutes(doc: DocumentedRouter, service: SyncPendingService) {
  const controller = createSyncPendingController(service);

  doc.get(
    '/sync/pending',
    {
      summary:
        "List a user's outstanding (not-yet-synced) sync items. `userId` defaults to the " +
        "caller's own id. A SAKHI may only request her own id; a SUPERVISOR may also " +
        'request a `userId` belonging to a Sakhi on their own roster.',
      tags: ['Sync'],
      responses: {
        200: {
          description:
            'Sync items still QUEUED, FAILED, or SKIPPED for the user, newest first, ' +
            "with each item's parent batch deviceId/startedAt inlined",
          schema: envelope(z.array(syncPendingItemSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or userId outside the caller's scope",
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    validate(syncPendingQueryRequestSchema, 'query'),
    controller.list,
  );
}
