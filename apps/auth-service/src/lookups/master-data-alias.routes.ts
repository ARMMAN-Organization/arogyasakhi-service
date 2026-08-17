import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { LookupService } from './lookup.service';
import { createMasterDataAliasController } from './master-data-alias.controller';
import { createLookupController } from './lookup.controller';
import { lookupCategorySchema } from './lookup.routes';
import { authenticate, errorResponse, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/** One alias route's registration inputs — path, the fixed categoryCode it serves, and its summary. */
interface AliasRoute {
  path: string;
  categoryCode: string;
  handlerKey: keyof ReturnType<typeof createMasterDataAliasController>;
  summary: string;
}

const ALIAS_ROUTES: readonly AliasRoute[] = [
  {
    path: '/risk-categories',
    categoryCode: 'RISK_CATEGORY',
    handlerKey: 'riskCategories',
    summary: 'Download all Risk Category master rows',
  },
  {
    path: '/risk-types',
    categoryCode: 'RISK_TYPE',
    handlerKey: 'riskTypes',
    summary: 'Download all Risk Type master rows',
  },
  {
    path: '/risk-languages',
    categoryCode: 'LANGUAGE',
    handlerKey: 'riskLanguages',
    summary:
      'Download all Risk Language master rows (the app-wide supported-language set — ' +
      'SRS Appendix I — not risk-specific translated content, which does not exist as ' +
      'structured data)',
  },
  {
    path: '/visit-categories',
    categoryCode: 'VISIT_CATEGORY',
    handlerKey: 'visitCategories',
    summary: 'Download all Visit Category master rows',
  },
  {
    path: '/item-categories',
    categoryCode: 'ITEM_CATEGORY',
    handlerKey: 'itemCategories',
    summary: 'Download all Item Category master rows',
  },
  {
    path: '/uom-list',
    categoryCode: 'UOM',
    handlerKey: 'uomList',
    summary:
      'Download all Unit-of-Measure master rows (PROVISIONAL — placeholder pending a real ' +
      'source; inventory_items.unit itself remains free text, unconstrained by this list)',
  },
  {
    path: '/transaction-types',
    categoryCode: 'TRANSACTION_TYPE',
    handlerKey: 'transactionTypes',
    summary: 'Download all Transaction Type master rows',
  },
  {
    path: '/gathering-statuses',
    categoryCode: 'GATHERING_STATUS',
    handlerKey: 'gatheringStatuses',
    summary: 'Download all Gathering Status master rows',
  },
  {
    path: '/gathering-types',
    categoryCode: 'GATHERING_TYPE',
    handlerKey: 'gatheringTypes',
    summary: 'Download all Gathering Type master rows',
  },
];

/**
 * Dedicated-path master-data download routes — each is a thin alias for
 * `GET /lookups/:categoryCode` with the categoryCode fixed, for consumers
 * that expect a distinct URL per master list. Mounted under the global
 * `api/v1` prefix, on the same router/service as `lookup.routes.ts`.
 */
export function registerMasterDataAliasRoutes(
  doc: DocumentedRouter,
  service: LookupService,
  signer: TokenSigner,
) {
  const controller = createMasterDataAliasController(service);

  for (const { path, categoryCode, handlerKey, summary } of ALIAS_ROUTES) {
    doc.get(
      path,
      {
        summary: `${summary}. Alias for GET /lookups/${categoryCode}.`,
        tags: ['Lookups'],
        responses: {
          200: {
            description: 'Lookup category with values',
            schema: envelope(lookupCategorySchema),
          },
          401: errorResponse(401),
          404: errorResponse(404, { message: 'Lookup category not found.' }),
          500: errorResponse(500),
        },
      },
      authenticate(signer),
      controller[handlerKey],
    );
  }

  // DDL Item has no single fixed categoryCode to alias — "generic
  // dropdown/reference values used across forms" describes the lookup
  // store as a whole, so this aliases the full aggregate GET /lookups
  // instead of one category.
  doc.get(
    '/ddl-items',
    {
      summary:
        'Download all DDL Item rows (every lookup category with its values — the generic ' +
        'dropdown/reference store used across forms). Alias for GET /lookups.',
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
    createLookupController(service).listAll,
  );
}
