import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the approval-service OpenAPI document from the registry that
 * `createApprovalRequestRouter` (via `createDocumentedRouter()`) already
 * populated as each route was defined — there is no separate,
 * hand-maintained route list to keep in sync here.
 */
export function buildApprovalServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Approval Service API',
    description: 'Generic supervisor approval requests and decisions.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
