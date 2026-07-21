import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the visit-form-service OpenAPI document from every feature router's
 * registry — each `createDocumentedRouter()` call creates its own registry,
 * so visits/forms routes are merged here (via the registry's `parents`
 * constructor param) rather than one router's routes silently missing from
 * the combined doc.
 */
export function buildVisitFormServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Visit Form Service API',
    description: 'Visit schedules and instances, form definitions and submissions.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
