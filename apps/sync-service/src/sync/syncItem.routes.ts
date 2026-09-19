import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { SyncItemService } from './syncItem.service';
import { createSyncItemController } from './syncItem.controller';
import { createSyncItemsSchema } from './dto/create-syncItem.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const createdSyncItemSchema = z.object({
  id: z.string().uuid(),
  localEntityUuid: z.string(),
  entityType: z.string(),
  status: z.enum(['QUEUED', 'SUCCESS', 'FAILED', 'SKIPPED', 'DUPLICATE', 'PARTIAL']).openapi({
    description:
      'DUPLICATE is computed server-side when this (localEntityUuid, entityType) already ' +
      'SUCCEEDED in an earlier batch, regardless of the status the caller reported.',
  }),
  retryCount: z.number().int().nonnegative(),
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
 * Sync-item HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Registers onto the same `doc` (DocumentedRouter/registry) that
 * `syncBatch.routes.ts`/`syncPending.routes.ts` use — see
 * `syncBatch.module.ts` for why one shared registry per service matters.
 */
export function registerSyncItemRoutes(doc: DocumentedRouter, service: SyncItemService) {
  const controller = createSyncItemController(service);

  doc.post(
    '/sync/items',
    {
      summary:
        'Report a bulk array of sync items for one sync batch (SRS §8.4: every synced ' +
        'entity/form/media item shall create a sync_items record). Applies duplicate ' +
        'detection and retry-count tracking server-side — see the response schema.',
      tags: ['Sync'],
      responses: {
        201: {
          description: 'Sync items recorded, with server-computed status/retryCount',
          schema: envelope(z.array(createdSyncItemSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or the sync batch is outside the caller's scope",
          schema: apiErrorSchema,
        },
        404: { description: 'A referenced syncBatchId does not exist', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    validateBody(createSyncItemsSchema),
    controller.create,
  );
}
