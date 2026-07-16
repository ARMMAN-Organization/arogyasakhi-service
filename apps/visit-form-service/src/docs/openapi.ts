import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the visit-form-service OpenAPI document from the registry that
 * `createVisitInstanceRouter` (via `createDocumentedRouter()`) already
 * populated as each route was defined — there is no separate, hand-maintained
 * route list to keep in sync here.
 */
export function buildVisitFormServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Visit Form Service API',
    description: 'Visit schedules and instances, form definitions and submissions.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
