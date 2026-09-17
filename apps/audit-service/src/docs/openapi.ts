import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the audit-service OpenAPI document from every feature router's
 * registry — each `createDocumentedRouter()` call creates its own registry,
 * merged here (via the registry's `parents` constructor param) so
 * audit/analytics routes never overwrite each other in the combined doc.
 * Same convention as approval-service's own docs/openapi.ts.
 */
export function buildAuditServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Audit Service API',
    description: 'Append-only audit trail for actions across the platform.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
