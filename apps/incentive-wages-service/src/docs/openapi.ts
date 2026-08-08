import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the incentive-wages-service OpenAPI document from every feature
 * router's registry — each `createDocumentedRouter()` call creates its own
 * registry, merged here (via the registry's `parents` constructor param) so
 * incentives/incentive-rates routes never overwrite each other in the
 * combined doc.
 */
export function buildIncentiveWagesServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Incentive Wages Service API',
    description: 'Incentive events and wage calculation.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
