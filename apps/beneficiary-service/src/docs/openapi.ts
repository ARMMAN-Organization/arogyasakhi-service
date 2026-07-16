import type { OpenAPIRegistry } from '@armman/service-commons';
import { buildServiceOpenApiDocument } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

/**
 * Builds the beneficiary-service OpenAPI document from the registry that
 * `createBeneficiaryRouter` (via `createDocumentedRouter()`) already
 * populated as each route was defined — there is no separate, hand-maintained
 * route list to keep in sync here.
 */
export function buildBeneficiaryServiceOpenApiDocument(registry: OpenAPIRegistry) {
  return buildServiceOpenApiDocument(registry, {
    title: 'Arogya Sakhi — Beneficiary Service API',
    description: 'Beneficiary identity, case enrollment, consent, and duplicate detection.',
    port: appConfig.PORT,
    publicBaseUrls: appConfig.PUBLIC_BASE_URLS,
  });
}
