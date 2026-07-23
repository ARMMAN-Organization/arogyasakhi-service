import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the supervisor-operations-service OpenAPI document from each feature
 * module's registry — every route registered via createDocumentedRouter() is
 * already in its module's registry, so this can never drift from what's mounted.
 * Variadic so new modules just add a registry argument (mirrors auth-service).
 */
export function buildSupervisorOperationsOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Supervisor Operations Service API',
    description: 'Supervisor field operations: events, attendance, call logs, and inventory.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
