import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the approval-service OpenAPI document from every feature router's
 * registry — each `createDocumentedRouter()` call creates its own registry,
 * merged here (via the registry's `parents` constructor param) so
 * approvals/quick-response routes never overwrite each other in the
 * combined doc.
 */
export function buildApprovalServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Approval Service API',
    description: 'Generic supervisor approval requests and decisions.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
