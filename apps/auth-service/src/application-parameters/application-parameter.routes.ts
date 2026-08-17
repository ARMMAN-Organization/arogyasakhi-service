import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { ApplicationParameterService } from './application-parameter.service';
import { createApplicationParameterController } from './application-parameter.controller';
import { authenticate, errorResponse, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const applicationParameterSchema = z.object({
  id: z.string().uuid().openapi({ example: '3eb3104f-3596-418f-8ccd-2e95323e14ba' }),
  paramKey: z.string().openapi({ example: 'SYNC_INTERVAL_MINUTES' }),
  paramValue: z.string().openapi({ example: '15' }),
  description: z
    .string()
    .nullable()
    .openapi({ example: 'Minutes between background sync attempts on the mobile app.' }),
  isActive: z.boolean().openapi({ example: true }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Application-parameter HTTP routes. Mounted under the global `api/v1`
 * prefix. A flat, app-wide configuration key/value store the mobile apps
 * cache locally (e.g. a sync interval, minimum supported app version, a
 * feature-flag toggle, a max upload size) — NOT a dropdown/reference list
 * (see lookup.routes.ts for that) and NOT a home for business
 * thresholds/rates, which live in GoRules/rules-service, or secrets, which
 * never belong in this table (root .claude/CLAUDE.md §9). Read is open to
 * any authenticated role, matching how `/lookups` and `/funders` are scoped —
 * this is master data every client needs, not an admin-only concern.
 */
export function registerApplicationParameterRoutes(
  doc: DocumentedRouter,
  service: ApplicationParameterService,
  signer: TokenSigner,
) {
  const controller = createApplicationParameterController(service);

  doc.get(
    '/application-parameters',
    {
      summary: 'List every active application parameter',
      tags: ['Application Parameters'],
      responses: {
        200: {
          description: 'All active application parameters',
          schema: envelope(z.array(applicationParameterSchema)),
        },
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    controller.list,
  );
}
