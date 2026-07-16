import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the sync-service OpenAPI document from the registry that
 * `createSyncBatchRouter` (via `createDocumentedRouter()`) already populated
 * as each route was defined — there is no separate, hand-maintained route
 * list to keep in sync here.
 */
export function buildSyncServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Sync Service API',
    description: 'Idempotent offline batch upload and download, delta packaging.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
