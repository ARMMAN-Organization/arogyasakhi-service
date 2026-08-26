import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the cms-content-service OpenAPI document from every feature
 * router's registry — each `createDocumentedRouter()` call creates its own
 * registry, merged here (via the registry's `parents` constructor param)
 * rather than one router's routes silently missing from the combined doc.
 */
export function buildCmsContentServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — CMS Content Service API',
    description: 'Health-education content and versioned offline content packs (wraps Strapi).',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
