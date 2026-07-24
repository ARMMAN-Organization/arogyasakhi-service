import { OpenAPIRegistry, buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the rules-service OpenAPI document from each feature module's registry
 * (rule-set CRUD + rule-version admin) — every route registered via
 * `createDocumentedRouter()` is already in its module's registry, so this can
 * never drift from what's actually mounted. Variadic so new modules just add a
 * registry argument (mirrors auth-service's multi-module doc builder).
 */
export function buildRulesServiceOpenApiDocument(...registries: OpenAPIRegistry[]) {
  const merged = new OpenAPIRegistry(registries);
  return buildServiceOpenApiDocument(merged, {
    title: 'Arogya Sakhi — Rules Service API',
    description: 'Central GoRules execution and versioned rule packs.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
