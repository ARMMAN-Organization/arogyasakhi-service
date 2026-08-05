import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the closure-reopen-service OpenAPI document from every feature
 * router's registry — each `createDocumentedRouter()` call creates its own
 * registry, merged here (via the registry's `parents` constructor param) so
 * closures/reopen-requests routes never overwrite each other in the combined doc.
 */
export function buildClosureReopenServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Closure Reopen Service API',
    description: 'Closure forms, supervisor review, and reopen requests.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
