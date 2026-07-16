import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the audit-service OpenAPI document from the registry that
 * `createAuditLogRouter` (via `createDocumentedRouter()`) already populated as
 * each route was defined — there is no separate, hand-maintained route list
 * to keep in sync here.
 */
export function buildAuditServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Audit Service API',
    description: 'Append-only audit trail for actions across the platform.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
