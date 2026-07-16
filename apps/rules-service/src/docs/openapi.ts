import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the rules-service OpenAPI document from the registry that
 * `createRuleSetRouter` (via `createDocumentedRouter()`) already populated as
 * each route was defined — there is no separate, hand-maintained route list
 * to keep in sync here.
 */
export function buildRulesServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Rules Service API',
    description: 'Central GoRules execution and versioned rule packs.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
