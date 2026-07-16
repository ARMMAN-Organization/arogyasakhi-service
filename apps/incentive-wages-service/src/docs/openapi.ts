import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the incentive-wages-service OpenAPI document from the registry that
 * `createIncentiveEventRouter` (via `createDocumentedRouter()`) already
 * populated as each route was defined — there is no separate, hand-maintained
 * route list to keep in sync here.
 */
export function buildIncentiveWagesServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Incentive Wages Service API',
    description: 'Incentive events and wage calculation.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
