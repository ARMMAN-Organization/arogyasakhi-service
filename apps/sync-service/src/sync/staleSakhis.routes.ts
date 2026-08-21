import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { StaleSakhisService } from './staleSakhis.service';
import { createStaleSakhisController } from './staleSakhis.controller';
import { staleSakhisQuerySchema } from './dto/stale-sakhis-query.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const staleSakhisQueryRequestSchema = staleSakhisQuerySchema.extend({
  days: staleSakhisQuerySchema.shape.days.openapi({
    example: 3,
    description: 'Staleness threshold in days. Defaults to 3.',
  }),
});

const staleSakhiSchema = z.object({
  userId: z.string().uuid(),
  lastSyncAt: z.string().datetime(),
  daysSinceSync: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
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
 * Stale-Sakhis HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Registers onto the same shared `doc` registry as `syncBatch.routes.ts`/
 * `syncPending.routes.ts` — see `syncBatch.module.ts` for why one registry
 * per service matters.
 */
export function registerStaleSakhisRoutes(doc: DocumentedRouter, service: StaleSakhisService) {
  const controller = createStaleSakhisController(service);

  doc.get(
    '/sync/stale-sakhis',
    {
      summary:
        "Lists Sakhis on the calling Supervisor's own roster whose most recent sync batch " +
        'is at least `days` old, with QUEUED/FAILED item counts. Does not include sakhiName — ' +
        "the caller merges that in from auth-service's roster (forklift rule: no cross-service " +
        'joins).',
      tags: ['Sync'],
      responses: {
        200: {
          description: "Stale Sakhis on the caller's roster, oldest lastSyncAt first",
          schema: envelope(z.array(staleSakhiSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: 'Caller role not permitted, or Supervisor has no project scope',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(staleSakhisQueryRequestSchema, 'query'),
    controller.list,
  );
}
