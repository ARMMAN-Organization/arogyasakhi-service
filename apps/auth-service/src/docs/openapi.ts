import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the auth-service OpenAPI document from every feature router's
 * registry — each `createDocumentedRouter()` call creates its own registry,
 * so auth/project/lookup routes are merged here (via the registry's
 * `parents` constructor param) rather than each service overwriting the
 * others' routes in the combined doc.
 */
export function buildAuthServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Auth Service API',
    description: 'Authentication, JWT/refresh tokens, sessions, and user management.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
