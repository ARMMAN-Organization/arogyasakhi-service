import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the auth-service OpenAPI document from the registry that
 * `createAuthRouter` (via `createDocumentedRouter()`) already populated as
 * each route was defined — there is no separate, hand-maintained route list
 * to keep in sync here.
 */
export function buildAuthServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Auth Service API',
    description: 'Authentication, JWT/refresh tokens, sessions, and user management.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
