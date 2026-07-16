import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the media-service OpenAPI document from the registry that
 * `createMediaAssetRouter` (via `createDocumentedRouter()`) already populated
 * as each route was defined — there is no separate, hand-maintained route
 * list to keep in sync here.
 */
export function buildMediaServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Media Service API',
    description: 'Signed-URL media uploads and metadata tracking.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
