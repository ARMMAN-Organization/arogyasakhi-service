import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the auth-service OpenAPI document from the registry that
 * `createAuthRouter` (via `createDocumentedRouter()`) already populated as
 * each route was defined — there is no separate, hand-maintained route list
 * to keep in sync here.
 */
export function buildAuthServiceOpenApiDocument(registry: OpenAPIRegistry) {
  const servers =
    appConfig.PUBLIC_BASE_URLS.length > 0
      ? appConfig.PUBLIC_BASE_URLS.map((url) => ({ url }))
      : [{ url: `http://localhost:${appConfig.PORT}`, description: 'Local' }];

  return buildOpenApiDocument(
    registry,
    {
      title: 'Arogya Sakhi — Auth Service API',
      version: '1.0.0',
      description: 'Authentication, JWT/refresh tokens, sessions, and user management.',
    },
    servers,
  );
}
